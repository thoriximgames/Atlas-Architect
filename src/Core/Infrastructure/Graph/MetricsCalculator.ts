import { GraphNode } from '../../Domain/Model/GraphNode.js';
import { IAtlasEdge } from '../../../Shared/Protocol.js';

export class MetricsCalculator {
    static calculateDescendants(nodes: Record<string, GraphNode>, edges: IAtlasEdge[]) {
        const memo = new Map<string, number>();

        // We assume 'edges' only contains hierarchy/gravity edges when calculating descendant count 
        // OR we filter them here. Based on GalaxyResolver, it used 'isGravity'.
        
        const gravityEdges = edges.filter(e => e.isGravity);

        const count = (id: string): number => {
            if (memo.has(id)) return memo.get(id)!;
            
            const children = gravityEdges.filter(e => e.source === id);
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
