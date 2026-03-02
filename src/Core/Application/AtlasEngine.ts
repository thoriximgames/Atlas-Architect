import path from 'path';
import fs from 'fs-extra';
import { IScanner } from '../Domain/Services/IScanner';
import { IGraphBuilder } from '../Domain/Services/IGraphBuilder';
import { ILayoutStrategy } from '../Domain/Services/ILayoutStrategy';
import { IAtlasRegistry, IPlannedNode } from '../../Shared/Protocol';
import { ColorProvider } from '../Infrastructure/Visualization/ColorProvider';
import { HeartbeatService } from './HeartbeatService';
import { IAtlasConfig } from '../../Shared/Config';

export class AtlasEngine {
    private heartbeat = new HeartbeatService();

    constructor(
        private scanner: IScanner,
        private graphBuilder: IGraphBuilder,
        private layoutStrategy: ILayoutStrategy
    ) {}

    async run(projectRoot: string, config: IAtlasConfig): Promise<IAtlasRegistry> {
        this.heartbeat.pulse();
        
        // Load existing registry to detect drift
        const dataDir = path.join(projectRoot, '.atlas/data');
        const atlasPath = path.join(dataDir, 'atlas.json');
        let oldNodes: Record<string, any> = {};
        if (await fs.pathExists(atlasPath)) {
            const oldRegistry = await fs.readJson(atlasPath);
            oldNodes = oldRegistry.nodes || {};
        }

        console.log(`[AtlasEngine] Scanning ${projectRoot}...`);
        const files = await this.scanner.scan(projectRoot, config.scanPatterns);
        console.log(`[AtlasEngine] Found ${files.length} source files.`);

        console.log(`[AtlasEngine] Building dependency graph...`);
        const graph = this.graphBuilder.build(files, config.entryPoints);

        // Apply Drift Detection & Preserve Verification Status
        const nodesToInvalidate = new Set<string>();

        for (const id in graph.nodes) {
            const node = graph.nodes[id];
            const old = oldNodes[id];
            
            if (old) {
                // Carry over manual annotations
                node.implementationNotes = old.implementationNotes;
                node.lastModifiedBy = old.lastModifiedBy;
                
                // Carry over verification if hash hasn't changed
                if (old.verificationStatus === 'verified' && old.verifiedHash === node.verifiedHash) {
                    node.verificationStatus = 'verified';
                    node.verifiedBy = old.verifiedBy;
                    node.verificationTimestamp = old.verificationTimestamp;
                } else if (old.verificationStatus === 'verified' && old.verifiedHash !== node.verifiedHash) {
                    node.verificationStatus = 'dirty';
                    console.log(`[AtlasEngine] Node ${id} marked as DIRTY (Self Hash mismatch).`);
                }

                // Check for Contract Ripple
                if (old.contractHash && old.contractHash !== node.contractHash) {
                    console.log(`[AtlasEngine] CONTRACT CHANGE DETECTED in ${id}. Rippling invalidation...`);
                    // Find everything that depends on this ID
                    graph.edges
                        .filter(e => e.target === id)
                        .forEach(e => nodesToInvalidate.add(e.source));
                }
            }
        }

        // Apply Ripple Effect
        for (const id of nodesToInvalidate) {
            const node = graph.nodes[id];
            if (node && node.verificationStatus === 'verified') {
                node.verificationStatus = 'dirty';
                node.implementationNotes = (node.implementationNotes || "") + "\n[SYSTEM] Marked dirty due to contract change in dependency.";
                console.log(`[AtlasEngine] Ripple: Node ${id} marked as DIRTY (Dependency Contract Changed).`);
            }
        }

        // Load planned topology
        const plannedPath = path.join(projectRoot, '.atlas/data/planned.json');
        if (await fs.pathExists(plannedPath)) {
            const plannedData = await fs.readJson(plannedPath);
            const plannedNodes: IPlannedNode[] = plannedData.plannedNodes || [];
            console.log(`[AtlasEngine] Merging ${plannedNodes.length} planned nodes...`);
            
            for (const planned of plannedNodes) {
                // Determine if this planned node already exists in the scanned graph
                const scannedNode = Object.values(graph.nodes).find(n => {
                    return n.file.includes(planned.id) || n.id === planned.id;
                });

                if (scannedNode) {
                    // It exists in code! Mark as verified.
                    scannedNode.status = 'verified';
                } else {
                    // Ghost node (planned but not yet implemented/scanned)
                    // If parent doesn't exist, default to depth 1
                    const parent = planned.parentId ? graph.nodes[planned.parentId] : undefined;
                    const depth = parent ? parent.depth + 1 : 1;
                    
                    graph.nodes[planned.id] = {
                        id: planned.id,
                        name: planned.name,
                        type: planned.type,
                        file: planned.id, // ID is the intended path
                        depth: depth,
                        parentId: planned.parentId,
                        islandId: 'planned_island',
                        descendantCount: 0,
                        dependencies: planned.dependencies,
                        baseClasses: [],
                        methods: [],
                        fields: [],
                        events: [],
                        complexity: 0,
                        violations: [],
                        color: ColorProvider.getFunctionalColor(planned.type, depth),
                        status: 'planned',
                        verificationStatus: 'auto',
                        initialX: 0, initialY: 0, sectorAngle: 0, sectorWidth: 0
                    };

                    if (planned.parentId) {
                        graph.edges.push({ source: planned.parentId, target: planned.id, isGravity: true, type: 'inheritance' });
                    }

                    const deps = planned.dependencies || [];
                    for (const dep of deps) {
                        // Note: dependencies in planned nodes might be names or IDs
                        graph.edges.push({ source: planned.id, target: dep, isGravity: false, type: 'dependency' });
                    }
                }
            }
        }
        
        console.log(`[AtlasEngine] Applying layout strategy...`);
        this.layoutStrategy.applyLayout(graph.nodes);

        // Architectural Linting
        this.validateArchitecture(graph.nodes, graph.edges, config);

        return {
            project: config.project,
            lastUpdated: new Date().toISOString(),
            nodes: graph.nodes,
            edges: graph.edges
        };
    }

    private validateArchitecture(nodes: Record<string, any>, edges: any[], config: IAtlasConfig) {
        if (!config.rules || config.rules.length === 0) return;

        console.log(`[AtlasEngine] Validating architecture against ${config.rules.length} rules...`);

        for (const rule of config.rules) {
            // Find nodes that match the 'from' pattern (could be NodeType or ID)
            const sourceNodes = Object.values(nodes).filter(n => 
                n.type === rule.from || n.id.includes(rule.from)
            );

            for (const sourceNode of sourceNodes) {
                // Find edges from this source node
                const outboundEdges = edges.filter(e => e.source === sourceNode.id);

                for (const edge of outboundEdges) {
                    const targetNode = nodes[edge.target];
                    if (!targetNode) continue;

                    // Allow explicit exceptions (e.g. Entity handles in ECS components)
                    if (rule.except && rule.except.some(ex => targetNode.name === ex || targetNode.id === ex)) {
                        continue;
                    }

                    // Check if target node matches any forbidden pattern
                    const isForbidden = rule.cannot_depend_on.some(pattern => 
                        targetNode.type === pattern || targetNode.id.includes(pattern)
                    );

                    if (isForbidden) {
                        const violation = `Iron Law Violation: ${sourceNode.type} '${sourceNode.name}' cannot depend on ${targetNode.type} '${targetNode.name}'. ${rule.reason || ''}`;
                        sourceNode.violations.push(violation);
                        console.warn(`[LINT] ${violation}`);
                    }
                }
            }
        }
    }

    static slice(registry: IAtlasRegistry, targetId: string, depth: number = 1): IAtlasRegistry {
        const discoveredIds = new Set<string>();
        const queue: { id: string, currentDepth: number }[] = [{ id: targetId, currentDepth: 0 }];

        while (queue.length > 0) {
            const { id, currentDepth } = queue.shift()!;
            if (discoveredIds.has(id)) continue;
            
            const node = registry.nodes[id];
            if (!node) continue;

            discoveredIds.add(id);

            if (currentDepth < depth) {
                // Find Children (dependencies of current node)
                registry.edges
                    .filter(e => e.source === id)
                    .forEach(e => queue.push({ id: e.target, currentDepth: currentDepth + 1 }));

                // Find Parents (nodes that depend on current node)
                registry.edges
                    .filter(e => e.target === id)
                    .forEach(e => queue.push({ id: e.source, currentDepth: currentDepth + 1 }));
            }
        }

        const slicedNodes: Record<string, any> = {};
        discoveredIds.forEach(id => {
            slicedNodes[id] = registry.nodes[id];
        });

        const slicedEdges = registry.edges.filter(e => 
            discoveredIds.has(e.source) && discoveredIds.has(e.target)
        );

        return {
            project: registry.project,
            lastUpdated: registry.lastUpdated,
            nodes: slicedNodes,
            edges: slicedEdges
        };
    }
}
