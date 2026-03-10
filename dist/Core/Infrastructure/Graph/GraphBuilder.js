"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphBuilder = void 0;
const MetricsCalculator_1 = require("./MetricsCalculator");
/**
 * GraphBuilder: Topological relationship resolver and graph architect.
 *
 * DESIGN INTENT:
 * Serves as the "Skeleton" constructor for the system. It takes the flat list of
 * scanned source files and transforms them into a directed hierarchical graph.
 * It is responsible for resolving string-based dependencies into concrete node
 * relationships and identifying architectural orphans.
 *
 * KEY RESPONSIBILITIES:
 * 1. Build the primary hierarchy based on entry points and gravity-based relationships.
 * 2. Resolve 'Interstellar' dependencies (cross-module imports).
 * 3. Event Bridge: Implicitly connects publishers and subscribers based on event names.
 * 4. Orphan Identification: Groups all unreachable nodes into the virtual '_UNCONNECTED_' root.
 */
class GraphBuilder {
    nodes = {};
    edges = [];
    nameToId = new Map();
    build(files, entryPointIds, strict = false) {
        this.nodes = {};
        this.edges = [];
        this.nameToId.clear();
        if (!files || files.length === 0) {
            return { nodes: {}, edges: [] };
        }
        const rawMap = new Map();
        for (const f of files) {
            this.nameToId.set(f.name, f.id);
            rawMap.set(f.id, f);
        }
        const visited = new Set();
        // Strategy: Process known entry points first, then any remaining orphans
        const entryPoints = entryPointIds
            .map(id => files.find(n => n.id === id || n.filePath === id || n.filePath.replace(/\.[^/.]+$/, "") === id))
            .filter(Boolean);
        let islandCounter = 0;
        const processFrom = (startId) => {
            const islandId = `island_${islandCounter++}`;
            const queue = [{ id: startId, depth: 0, parentId: undefined }];
            while (queue.length > 0) {
                const { id, depth, parentId } = queue.shift();
                if (visited.has(id))
                    continue;
                visited.add(id);
                const raw = rawMap.get(id);
                if (!raw)
                    continue;
                const node = {
                    id: raw.id,
                    name: raw.name,
                    type: raw.type,
                    file: raw.id,
                    language: raw.language,
                    depth: depth,
                    parentId: parentId,
                    islandId: islandId,
                    descendantCount: 0,
                    dependencies: raw.dependencies,
                    baseClasses: raw.baseClasses,
                    methods: raw.methods || [],
                    fields: raw.fields || [],
                    events: raw.events || [],
                    complexity: raw.complexity || 0,
                    description: raw.description,
                    implementationNotes: '',
                    lastModifiedBy: '',
                    violations: [],
                    status: 'verified',
                    verificationStatus: 'auto',
                    verifiedHash: raw.hash,
                    contractHash: raw.contractHash,
                    initialX: 0, initialY: 0, sectorAngle: 0, sectorWidth: 0
                };
                this.nodes[id] = node;
                if (parentId) {
                    this.edges.push({ source: parentId, target: id, isGravity: true, type: 'inheritance' });
                }
                (raw.dependencies || []).forEach((dep) => {
                    const targetId = this.nameToId.get(dep);
                    if (targetId && !visited.has(targetId)) {
                        const targetRaw = rawMap.get(targetId);
                        // SERVICE GRAVITY: If a component uses a System, the System is the Master.
                        // We invert the relationship if the target is a 'System' and current is not.
                        if (targetRaw && targetRaw.type === 'System' && node.type !== 'System') {
                            // Don't push to queue yet, this node will be found as a dependency later 
                            // or it will be processed as a root and find its gravity then.
                        }
                        else {
                            queue.push({ id: targetId, depth: depth + 1, parentId: id });
                        }
                    }
                });
            }
        };
        // 1. Process explicit entry points (The True Roots)
        entryPoints.forEach(ep => processFrom(ep.id));
        // 2. Identify Orphans (Nodes not reachable from Entry Points)
        // If strict mode is ON, we IGNORE everything that isn't explicitly connected to an entry point.
        if (strict) {
            console.log(`[GraphBuilder] STRICT MODE: Excluding ${files.length - visited.size} unreachable orphans.`);
        }
        else {
            const orphans = [];
            for (const file of files) {
                if (!visited.has(file.id)) {
                    orphans.push(file.id);
                }
            }
            // 3. Create the "Debris Pile" (Virtual Root for Orphans)
            if (orphans.length > 0) {
                const orphanRootId = '_UNCONNECTED_';
                this.nodes[orphanRootId] = {
                    id: orphanRootId,
                    name: '⚠️ UNCONNECTED',
                    type: 'Unknown',
                    file: '',
                    depth: 0,
                    islandId: 'island_orphans',
                    descendantCount: orphans.length,
                    dependencies: [],
                    baseClasses: [],
                    methods: [],
                    fields: [],
                    events: [],
                    complexity: 0,
                    violations: [],
                    status: 'orphan',
                    verificationStatus: 'auto',
                    initialX: 0, initialY: 0, sectorAngle: 0, sectorWidth: Math.PI * 2,
                    parentId: undefined
                };
                orphans.forEach(orphanId => {
                    this.processOrphanTree(orphanId, orphanRootId, rawMap, visited);
                });
            }
        }
        MetricsCalculator_1.MetricsCalculator.calculateDescendants(this.nodes, this.edges);
        this.resolveInterstellar(rawMap);
        this.resolveEventBridge();
        return {
            nodes: this.nodes,
            edges: this.edges
        };
    }
    resolveEventBridge() {
        const subscribers = Object.values(this.nodes).filter(n => n.events.some(e => e.flow === 'subscribe'));
        const publishers = Object.values(this.nodes).filter(n => n.events.some(e => e.flow === 'publish'));
        const normalize = (name) => name.toLowerCase().replace(/^on/, '');
        for (const sub of subscribers) {
            for (const subEvent of sub.events.filter(e => e.flow === 'subscribe')) {
                const subName = normalize(subEvent.name);
                for (const pub of publishers) {
                    if (pub.id === sub.id)
                        continue;
                    if (pub.events.some(e => e.flow === 'publish' && (normalize(e.name) === subName || (e.dataType && normalize(e.dataType) === subName)))) {
                        // Create a "Soft Link" for the event flow
                        if (!this.edges.find(e => e.source === pub.id && e.target === sub.id && e.type === 'event')) {
                            this.edges.push({
                                source: pub.id,
                                target: sub.id,
                                isGravity: false,
                                type: 'event'
                            });
                        }
                    }
                }
            }
        }
    }
    processOrphanTree(startId, parentId, rawMap, visited) {
        if (visited.has(startId))
            return;
        const queue = [{ id: startId, pid: parentId }];
        while (queue.length > 0) {
            const { id, pid } = queue.shift();
            if (visited.has(id))
                continue;
            visited.add(id);
            const raw = rawMap.get(id);
            if (!raw)
                continue;
            const node = {
                id: raw.id,
                name: raw.name,
                type: raw.type, // Use detected type
                file: raw.id,
                language: raw.language,
                depth: 1, // Flatten orphans to depth 1 relative to the Debris Root
                parentId: pid,
                islandId: 'island_orphans',
                descendantCount: 0,
                dependencies: raw.dependencies,
                baseClasses: raw.baseClasses,
                methods: raw.methods || [],
                fields: raw.fields || [],
                events: raw.events || [],
                complexity: raw.complexity || 0,
                description: raw.description,
                implementationNotes: '',
                lastModifiedBy: '',
                violations: [],
                status: 'orphan',
                verificationStatus: 'auto',
                verifiedHash: raw.hash,
                contractHash: raw.contractHash,
                initialX: 0, initialY: 0, sectorAngle: 0, sectorWidth: 0
            };
            this.nodes[id] = node;
            this.edges.push({ source: pid, target: id, isGravity: true, type: 'inheritance' });
            (raw.dependencies || []).forEach((dep) => {
                const targetId = this.nameToId.get(dep);
                if (targetId && !visited.has(targetId)) {
                    queue.push({ id: targetId, pid: id });
                }
            });
        }
    }
    resolveInterstellar(rawMap) {
        for (const nodeId in this.nodes) {
            const raw = rawMap.get(nodeId);
            if (!raw)
                continue;
            (raw.dependencies || []).forEach((dep) => {
                const tid = this.nameToId.get(dep);
                if (tid && this.nodes[tid] && !this.edges.find(e => e.source === nodeId && e.target === tid)) {
                    this.edges.push({ source: nodeId, target: tid, isGravity: false, type: 'dependency' });
                }
            });
        }
    }
}
exports.GraphBuilder = GraphBuilder;
