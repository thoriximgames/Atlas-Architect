import { VisualNode } from '../Protocol/VisualTypes';

export class GalaxyPhysics {
    static centrifugal(cx: number, cy: number, strength: number = 5.0) {
        let nodes: VisualNode[];
        function force(alpha: number) {
            const a = alpha * strength;
            for (const d of nodes) {
                if (d.depth === 0) continue;
                const dx = d.x! - cx; const dy = d.y! - cy;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                d.vx! += (dx / dist) * a; d.vy! += (dy / dist) * a;
            }
        }
        force.initialize = (_nodes: VisualNode[]) => nodes = _nodes;
        return force;
    }

    static sector(cx: number, cy: number, strength: number = 3.0) {
        let nodes: VisualNode[];
        function force(alpha: number) {
            const a = alpha * strength;
            for (const d of nodes) {
                if (d.sectorWidth === 0) continue;
                const dx = d.x! - cx; const dy = d.y! - cy;
                const angle = Math.atan2(dy, dx);
                const diff = Math.atan2(Math.sin(angle - d.sectorAngle), Math.cos(angle - d.sectorAngle));
                if (Math.abs(diff) > (d.sectorWidth / 2)) {
                    const target = d.sectorAngle + (diff > 0 ? d.sectorWidth/2 : -d.sectorWidth/2);
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    d.vx! += (Math.cos(target) * dist - dx) * a;
                    d.vy! += (Math.sin(target) * dist - dy) * a;
                }
            }
        }
        force.initialize = (_nodes: VisualNode[]) => nodes = _nodes;
        return force;
    }
}
