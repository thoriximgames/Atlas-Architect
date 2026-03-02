"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolarLayoutStrategy = void 0;
class PolarLayoutStrategy {
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
        // Root placement (Layer 0)
        // If there's only one root, place it at center. 
        // If there are multiple, distribute them on an inner circle.
        if (roots.length === 1) {
            roots[0].initialX = 0;
            roots[0].initialY = 0;
            roots[0].sectorAngle = 0;
            roots[0].sectorWidth = Math.PI * 2;
            this.distributeChildren(roots[0].id, 0, Math.PI * 2, childrenMap);
        }
        else {
            const totalWeight = roots.reduce((sum, r) => sum + (r.descendantCount + 1), 0);
            let currentAngle = 0;
            const innerRadius = PolarLayoutStrategy.LAYER_RADIUS * 0.5; // Offset roots from center
            roots.forEach((root) => {
                const weight = root.descendantCount + 1;
                const wedge = (weight / totalWeight) * (Math.PI * 2);
                const angle = currentAngle + (wedge / 2);
                root.sectorAngle = angle;
                root.sectorWidth = wedge;
                root.initialX = Math.cos(angle) * innerRadius;
                root.initialY = Math.sin(angle) * innerRadius;
                this.distributeChildren(root.id, angle, wedge, childrenMap);
                currentAngle += wedge;
            });
        }
    }
    distributeChildren(parentId, parentAngle, parentWedge, childrenMap) {
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
            // Offset by inner circle if multiple roots
            const radius = (child.depth + 0.5) * PolarLayoutStrategy.LAYER_RADIUS;
            child.sectorAngle = childAngle;
            child.sectorWidth = childWedge;
            // PROJECT: Strictly away from center
            child.initialX = Math.cos(childAngle) * radius;
            child.initialY = Math.sin(childAngle) * radius;
            this.distributeChildren(child.id, childAngle, childWedge, childrenMap);
            currentAngle += childWedge;
        });
    }
}
exports.PolarLayoutStrategy = PolarLayoutStrategy;
