export class PolarLayout {
    static STEP_RADIUS = 450;
    static ISLAND_GAP = 5000; // Large gap for grid
    static calculate(nodes) {
        const nodeList = Object.values(nodes);
        if (nodeList.length === 0)
            return;
        const roots = nodeList.filter(n => n.depth === 0);
        if (roots.length === 0)
            return;
        const childrenMap = new Map();
        nodeList.forEach(n => {
            if (n.parentId) {
                const list = childrenMap.get(n.parentId) || [];
                list.push(n);
                childrenMap.set(n.parentId, list);
            }
        });
        const distribute = (parentId, currentAngle, currentWidth, px, py) => {
            const children = childrenMap.get(parentId) || [];
            if (children.length === 0)
                return;
            // Children branch out within a 90-degree sector centered on the parent's orientation
            const branchWedge = Math.min(currentWidth, Math.PI / 2);
            const startAngle = currentAngle - (branchWedge / 2) + (branchWedge / (children.length * 2));
            const step = branchWedge / children.length;
            children.forEach((child, i) => {
                child.sectorAngle = startAngle + (i * step);
                child.sectorWidth = step;
                this.projectNode(child, px, py);
                distribute(child.id, child.sectorAngle, child.sectorWidth, child.initialX, child.initialY);
            });
        };
        // Grid-based Island spacing
        const cols = Math.ceil(Math.sqrt(roots.length));
        roots.forEach((root, ri) => {
            const row = Math.floor(ri / cols);
            const col = ri % cols;
            root.initialX = col * this.ISLAND_GAP;
            root.initialY = row * this.ISLAND_GAP;
            root.sectorAngle = 0;
            root.sectorWidth = Math.PI * 2;
            const l1 = childrenMap.get(root.id) || [];
            if (l1.length > 0) {
                const l1Wedge = (Math.PI * 2) / l1.length;
                l1.forEach((node, i) => {
                    node.sectorAngle = i * l1Wedge;
                    node.sectorWidth = l1Wedge * 0.8;
                    this.projectNode(node, root.initialX, root.initialY);
                    distribute(node.id, node.sectorAngle, node.sectorWidth, node.initialX, node.initialY);
                });
            }
        });
    }
    static projectNode(node, px, py) {
        node.initialX = px + Math.cos(node.sectorAngle) * this.STEP_RADIUS;
        node.initialY = py + Math.sin(node.sectorAngle) * this.STEP_RADIUS;
    }
}
