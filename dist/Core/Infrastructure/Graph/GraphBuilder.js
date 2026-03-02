import { MetricsCalculator } from './MetricsCalculator.js';
import { ColorProvider } from '../Visualization/ColorProvider.js';
export class GraphBuilder {
    nodes = {};
    edges = [];
    nameToId = new Map();
    build(files) {
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
        // Use a generic starting point strategy or configuration.
        // For now, mirroring the logic: 'MMO-Server/src/Main'
        // Ideally this should be injected configuration.
        const primaryMain = files.find(n => n.id === 'MMO-Server/src/Main');
        if (primaryMain) {
            const islandId = 'island_0';
            const queue = [{ id: primaryMain.id, depth: 0 }];
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
                    file: raw.filePath,
                    depth: depth,
                    parentId: parentId,
                    islandId: islandId,
                    descendantCount: 0,
                    dependencies: raw.dependencies,
                    baseClasses: raw.baseClasses,
                    color: ColorProvider.getFunctionalColor(raw.type, depth),
                    initialX: 0, initialY: 0, sectorAngle: 0, sectorWidth: 0
                };
                this.nodes[id] = node;
                if (parentId) {
                    this.edges.push({ source: parentId, target: id, isGravity: true });
                }
                (raw.dependencies || []).forEach((dep) => {
                    const targetId = this.nameToId.get(dep);
                    if (targetId && !visited.has(targetId)) {
                        queue.push({ id: targetId, depth: depth + 1, parentId: id });
                    }
                });
            }
        }
        MetricsCalculator.calculateDescendants(this.nodes, this.edges);
        this.resolveInterstellar(rawMap);
        return {
            nodes: this.nodes,
            edges: this.edges
        };
    }
    resolveInterstellar(rawMap) {
        for (const nodeId in this.nodes) {
            const raw = rawMap.get(nodeId);
            if (!raw)
                continue;
            (raw.dependencies || []).forEach((dep) => {
                const tid = this.nameToId.get(dep);
                if (tid && this.nodes[tid] && !this.edges.find(e => e.source === nodeId && e.target === tid)) {
                    this.edges.push({ source: nodeId, target: tid, isGravity: false });
                }
            });
        }
    }
}
