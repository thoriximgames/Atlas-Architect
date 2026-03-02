export class MetricsEngine {
    static calculateDescendants(nodes, edges) {
        const memo = new Map();
        const count = (id) => {
            if (memo.has(id))
                return memo.get(id);
            const children = edges.filter(e => e.source === id && e.isGravity);
            let total = children.length;
            for (const child of children) {
                total += count(child.target);
            }
            if (nodes[id]) {
                nodes[id].descendantCount = total;
            }
            memo.set(id, total);
            return total;
        };
        const roots = Object.values(nodes).filter(n => n.depth === 0);
        roots.forEach(r => count(r.id));
    }
}
