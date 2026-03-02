"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtlasEngine = void 0;
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const ColorProvider_1 = require("../Infrastructure/Visualization/ColorProvider");
const HeartbeatService_1 = require("./HeartbeatService");
class AtlasEngine {
    scanner;
    graphBuilder;
    layoutStrategy;
    heartbeat = new HeartbeatService_1.HeartbeatService();
    constructor(scanner, graphBuilder, layoutStrategy) {
        this.scanner = scanner;
        this.graphBuilder = graphBuilder;
        this.layoutStrategy = layoutStrategy;
    }
    async run(projectRoot, config) {
        this.heartbeat.pulse();
        // Load existing registry to detect drift
        const dataDir = path_1.default.join(projectRoot, '.atlas/data');
        const atlasPath = path_1.default.join(dataDir, 'atlas.json');
        let oldNodes = {};
        if (await fs_extra_1.default.pathExists(atlasPath)) {
            const oldRegistry = await fs_extra_1.default.readJson(atlasPath);
            oldNodes = oldRegistry.nodes || {};
        }
        console.log(`[AtlasEngine] Scanning ${projectRoot}...`);
        const files = await this.scanner.scan(projectRoot, config.scanPatterns);
        console.log(`[AtlasEngine] Found ${files.length} source files.`);
        console.log(`[AtlasEngine] Building dependency graph...`);
        const graph = this.graphBuilder.build(files, config.entryPoints);
        // Apply Drift Detection & Preserve Verification Status
        const nodesToInvalidate = new Set();
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
                }
                else if (old.verificationStatus === 'verified' && old.verifiedHash !== node.verifiedHash) {
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
        const plannedPath = path_1.default.join(projectRoot, '.atlas/data/planned.json');
        if (await fs_extra_1.default.pathExists(plannedPath)) {
            const plannedData = await fs_extra_1.default.readJson(plannedPath);
            const plannedNodes = plannedData.plannedNodes || [];
            console.log(`[AtlasEngine] Merging ${plannedNodes.length} planned nodes...`);
            for (const planned of plannedNodes) {
                // Determine if this planned node already exists in the scanned graph
                const scannedNode = Object.values(graph.nodes).find(n => {
                    return n.file.includes(planned.id) || n.id === planned.id;
                });
                if (scannedNode) {
                    // It exists in code! Mark as verified.
                    scannedNode.status = 'verified';
                    // MERGE GUARDIAN PROTOCOL
                    if (planned.authorityId)
                        scannedNode.authorityId = planned.authorityId;
                    if (planned.guardState)
                        scannedNode.guardState = planned.guardState;
                    if (planned.isAuthority)
                        scannedNode.isAuthority = planned.isAuthority;
                }
                else {
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
                        color: ColorProvider_1.ColorProvider.getFunctionalColor(planned.type, depth),
                        status: 'planned',
                        verificationStatus: 'auto',
                        authorityId: planned.authorityId,
                        guardState: planned.guardState,
                        isAuthority: planned.isAuthority,
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
    validateArchitecture(nodes, edges, config) {
        if (!config.rules || config.rules.length === 0)
            return;
        console.log(`[AtlasEngine] Validating architecture against ${config.rules.length} rules...`);
        for (const rule of config.rules) {
            // Find nodes that match the 'from' pattern (could be NodeType or ID)
            const sourceNodes = Object.values(nodes).filter(n => n.type === rule.from || n.id.includes(rule.from));
            for (const sourceNode of sourceNodes) {
                // Find edges from this source node
                const outboundEdges = edges.filter(e => e.source === sourceNode.id);
                for (const edge of outboundEdges) {
                    const targetNode = nodes[edge.target];
                    if (!targetNode)
                        continue;
                    // Allow explicit exceptions (e.g. Entity handles in ECS components)
                    if (rule.except && rule.except.some(ex => targetNode.name === ex || targetNode.id === ex)) {
                        continue;
                    }
                    // Check if target node matches any forbidden pattern
                    const isForbidden = rule.cannot_depend_on.some(pattern => targetNode.type === pattern || targetNode.id.includes(pattern));
                    if (isForbidden) {
                        const violation = `Iron Law Violation: ${sourceNode.type} '${sourceNode.name}' cannot depend on ${targetNode.type} '${targetNode.name}'. ${rule.reason || ''}`;
                        sourceNode.violations.push(violation);
                        console.warn(`[LINT] ${violation}`);
                    }
                }
            }
        }
    }
    static slice(registry, targetId, depth = 1) {
        const discoveredIds = new Set();
        const queue = [{ id: targetId, currentDepth: 0 }];
        while (queue.length > 0) {
            const { id, currentDepth } = queue.shift();
            if (discoveredIds.has(id))
                continue;
            const node = registry.nodes[id];
            if (!node)
                continue;
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
        const slicedNodes = {};
        discoveredIds.forEach(id => {
            slicedNodes[id] = registry.nodes[id];
        });
        const slicedEdges = registry.edges.filter(e => discoveredIds.has(e.source) && discoveredIds.has(e.target));
        return {
            project: registry.project,
            lastUpdated: registry.lastUpdated,
            nodes: slicedNodes,
            edges: slicedEdges
        };
    }
}
exports.AtlasEngine = AtlasEngine;
