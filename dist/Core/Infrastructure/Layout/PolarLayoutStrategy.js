export class PolarLayoutStrategy {
    static LAYER_RADIUS = 800;
    applyLayout(nodes) {
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
        const distribute = (parentId, parentAngle, parentWedge) => {
            const children = childrenMap.get(parentId) || [];
            if (children.length === 0)
                return;
            // Sort children by descendant count
            children.sort((a, b) => b.descendantCount - a.descendantCount);
            const totalWeight = children.reduce((sum, c) => sum + (c.descendantCount + 1), 0);
            let currentAngle = parentAngle - (parentWedge / 2);
            children.forEach((child) => {
                const childWeight = child.descendantCount + 1;
                const childWedge = (childWeight / totalWeight) * parentWedge;
                const childAngle = currentAngle + (childWedge / 2);
                // STABLE RADIUS: Strictly based on depth
                const radius = child.depth * PolarLayoutStrategy.LAYER_RADIUS;
                child.sectorAngle = childAngle;
                child.sectorWidth = childWedge;
                // PROJECT: Strictly away from (0,0)
                child.initialX = Math.cos(childAngle) * radius;
                child.initialY = Math.sin(childAngle) * radius;
                distribute(child.id, childAngle, childWedge);
                currentAngle += childWedge;
            });
        };
        // Root placement (Layer 0) at origin
        roots.forEach((root) => {
            root.initialX = 0;
            root.initialY = 0;
            root.sectorAngle = 0;
            root.sectorWidth = Math.PI * 2;
            const l1 = childrenMap.get(root.id) || [];
            if (l1.length > 0) {
                const totalWeight = l1.reduce((sum, c) => sum + (c.descendantCount + 1), 0);
                let currentAngle = 0;
                l1.forEach((node) => {
                    const weight = node.descendantCount + 1;
                    const wedge = (weight / totalWeight) * (Math.PI * 2);
                    const angle = currentAngle + (wedge / 2);
                    const radius = PolarLayoutStrategy.LAYER_RADIUS;
                    node.sectorAngle = angle;
                    node.sectorWidth = wedge;
                    node.initialX = Math.cos(angle) * radius;
                    node.initialY = Math.sin(angle) * radius;
                    distribute(node.id, angle, wedge);
                    currentAngle += wedge;
                });
            }
        });
    }
}
