import * as d3 from 'd3';
import { VisualNode, VisualLink } from '../Protocol/VisualTypes';

export class GalaxyEngine {
    private simulation: d3.Simulation<VisualNode, VisualLink>;
    private activeNodes: VisualNode[] = [];
    private activeLinks: VisualLink[] = [];
    private allNodes: VisualNode[];
    private allLinks: VisualLink[];
    private onUpdate: () => void;
    private onDataChange: () => void; // Renamed from onSpawn for clarity
    private weightMap: Map<string, number> = new Map();
    private spawnTimer: any = null;

    constructor(nodes: VisualNode[], links: VisualLink[], onUpdate: () => void, onDataChange: () => void) {
        this.allNodes = nodes;
        this.allLinks = links;
        this.onUpdate = onUpdate;
        this.onDataChange = onDataChange;

        for (const n of nodes) this.weightMap.set(n.id, n.descendantCount);

        this.simulation = d3.forceSimulation<VisualNode>(this.activeNodes)
            .alphaDecay(0.02)
            .velocityDecay(0.3)
            .on('tick', this.onUpdate);

        this.simulation.force('link', d3.forceLink<VisualNode, VisualLink>(this.activeLinks)
            .id(d => d.id)
            .distance(d => d.isGravity ? 450 : 300)
            .strength(d => d.isGravity ? 2.0 : 0.05));
            
        this.simulation.force('x', d3.forceX<VisualNode>(d => d.initialX).strength(0.15));
        this.simulation.force('y', d3.forceY<VisualNode>(d => d.initialY).strength(0.15));
        
        this.simulation.force('collision', d3.forceCollide<VisualNode>().radius(d => d.radius + 20).strength(0.5));
    }

    bootstrap() {
        this.stopBootstrap();
        this.activeNodes.length = 0;
        this.activeLinks.length = 0;

        let depth = 0;
        const max = d3.max(this.allNodes, d => d.depth) || 0;

        const spawn = () => {
            if (depth > max) {
                this.onDataChange();
                return;
            }
            
            const newNodes = this.allNodes.filter(n => n.depth === depth && n.status !== 'orphan');
            
            newNodes.forEach(node => {
                const parent = this.activeNodes.find(an => an.id === node.parentId);
                const px = parent ? (parent.x || node.initialX) : node.initialX;
                const py = parent ? (parent.y || node.initialY) : node.initialY;
                
                // Use initialX/Y which now correctly propagates from the backend
                if (node.x === undefined) node.x = node.initialX;
                if (node.y === undefined) node.y = node.initialY;

                // Rule: If initial coordinates are non-zero (manually saved), lock them.
                if (node.initialX !== 0 || node.initialY !== 0) {
                    node.fx = node.x;
                    node.fy = node.y;
                }
            });

            this.activeNodes.push(...newNodes);
            this.syncLinks();
            
            this.simulation.nodes(this.activeNodes);
            (this.simulation.force('link') as any).links(this.activeLinks);
            
            this.simulation.alpha(1).restart();
            this.onDataChange();
            
            depth++;
            this.spawnTimer = setTimeout(spawn, 800);
        };
        spawn();
    }

    async savePositions() {
        const updates: Record<string, { x: number, y: number }> = {};

        this.activeNodes.forEach(node => {
            if (node.x !== undefined && node.y !== undefined) {
                // Store absolute world coordinates
                updates[node.id] = { x: node.x, y: node.y };
            }
        });

        try {
            const res = await fetch('../api/topology/positions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (res.ok) {
                // Persisted updates
            }
        } catch (e) {
            console.error(`[Engine] Failed to save positions:`, e);
        }
    }

    private syncLinks() {
        const ids = new Set(this.activeNodes.map(n => n.id));
        const validLinks = this.allLinks.filter(l => {
            const s = (l.source as any).id || l.source;
            const t = (l.target as any).id || l.target;
            return ids.has(s) && ids.has(t);
        });
        this.activeLinks.length = 0; 
        this.activeLinks.push(...validLinks);
    }

    stopBootstrap() {
        if (this.spawnTimer) {
            clearTimeout(this.spawnTimer);
            this.spawnTimer = null;
        }
    }

    resetData(nodes: VisualNode[], links: VisualLink[]) {
        this.stopBootstrap();
        
        // 1. Ensure all nodes are valid objects
        const validNodes = nodes.filter(n => n && typeof n === 'object' && n.id);
        const nodeIds = new Set(validNodes.map(n => n.id));

        this.activeNodes.length = 0;
        this.activeNodes.push(...validNodes);
        
        // 2. Clone links and ensure they only point to valid nodes
        // D3 mutates link objects (replaces ID with object ref), so cloning is mandatory.
        const validLinks = links
            .filter(l => {
                const s = (l.source as any).id || l.source;
                const t = (l.target as any).id || l.target;
                return nodeIds.has(s) && nodeIds.has(t);
            })
            .map(l => ({ ...l }));

        this.activeLinks.length = 0;
        this.activeLinks.push(...validLinks);

        // 3. Reset simulation with fresh data
        this.simulation.nodes(this.activeNodes);
        (this.simulation.force('link') as any).links(this.activeLinks);
        
        this.simulation.alpha(1).restart();
        
        // CRITICAL: Tell the renderer that the structural data has changed
        this.onDataChange();
    }

    get state() { return { nodes: this.activeNodes, links: this.activeLinks, weightMap: this.weightMap }; }
}
