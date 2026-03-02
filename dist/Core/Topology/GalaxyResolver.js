import { PolarLayout } from '../Layout/PolarLayout.js';
import { MetricsEngine } from './MetricsEngine.js';
import { ColorProvider } from './ColorProvider.js';
export class GalaxyResolver {
    nodes = {};
    edges = [];
    nameToId = new Map();
    resolve(rawNodes) {
        this.nodes = {};
        this.edges = [];
        this.nameToId.clear();
        if (!rawNodes || rawNodes.length === 0) {
            return { project: "MMO-SUITE", lastUpdated: new Date().toISOString(), nodes: {}, edges: [] };
        }
        const rawMap = new Map();
        for (const raw of rawNodes) {
            this.nameToId.set(raw.name, raw.id);
            rawMap.set(raw.id, raw);
        }
        const visited = new Set();
        // ONLY start from the primary MMO-Server Main node
        const primaryMain = rawNodes.find(n => n.id === 'MMO-Server/src/Main');
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
        MetricsEngine.calculateDescendants(this.nodes, this.edges);
        PolarLayout.calculate(this.nodes);
        this.resolveInterstellar(rawMap);
        return {
            project: "MMO-SUITE",
            lastUpdated: new Date().toISOString(),
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
