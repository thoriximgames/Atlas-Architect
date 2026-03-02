"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphBuilder = void 0;
const MetricsCalculator_1 = require("./MetricsCalculator");
const ColorProvider_1 = require("../Visualization/ColorProvider");
class GraphBuilder {
    nodes = {};
    edges = [];
    nameToId = new Map();
    build(files, entryPointIds) {
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
            .map(id => files.find(n => n.id === id))
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
                const existingNode = this.nodes[id]; // This won't work yet because we process files fresh.
                // We need to pass the "Previous Registry" to GraphBuilder.
                const node = {
                    id: raw.id,
                    name: raw.name,
                    type: raw.type,
                    file: raw.id,
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
                    color: ColorProvider_1.ColorProvider.getFunctionalColor(raw.type, depth, raw.name),
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
                color: '#450a0a', // Deep Blood Red for Debris Root
                status: 'orphan',
                verificationStatus: 'auto',
                initialX: 0, initialY: 0, sectorAngle: 0, sectorWidth: Math.PI * 2,
                parentId: undefined // Fix: Explicitly undefined
            };
            orphans.forEach(orphanId => {
                this.processOrphanTree(orphanId, orphanRootId, rawMap, visited);
            });
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
                color: '#555555', // Grey for dead code
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
