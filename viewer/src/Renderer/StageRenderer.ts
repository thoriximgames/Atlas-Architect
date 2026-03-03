import * as d3 from 'd3';
import { VisualNode, VisualLink } from '../Protocol/VisualTypes';

export class StageRenderer {
    private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
    private brushLayer: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
    private g: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private linkLayer: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
    private nodeLayer: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
    private nodeSelection: d3.Selection<SVGGElement, VisualNode, SVGGElement, any> | null = null;
    private linkSelection: d3.Selection<SVGLineElement, VisualLink, SVGGElement, any> | null = null;
    private currentLinks: VisualLink[] = [];
    private currentNodes: VisualNode[] = [];
    private weightMap: Map<string, number> = new Map();
    private transform: d3.ZoomTransform = d3.zoomIdentity;
    private focusedNodeIds: Set<string> = new Set();
    private selectedNodeId: string | null = null;
    private brush: d3.BrushBehavior<unknown>;
    private onSelectionChange?: (ids: Set<string>) => void;

    constructor(onBgClick: () => void) {
        const container = d3.select('#visualizer-canvas');
        
        // Canvas Layer (Background Links / Distant)
        this.canvas = container.append('canvas')
            .style('position', 'absolute')
            .style('top', '0').style('left', '0')
            .attr('width', window.innerWidth)
            .attr('height', window.innerHeight)
            .node() as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

        // SVG Layer (Nodes & Essential Links)
        this.svg = container.append('svg')
            .style('position', 'absolute')
            .style('top', '0').style('left', '0')
            .attr('width', '100%').attr('height', '100%');
            
        this.svg.on('click', (e) => { 
            // Clear selection on background click
            if (e.target === this.svg.node() || d3.select(e.target).classed('overlay')) {
                onBgClick(); 
                if (this.onSelectionChange) this.onSelectionChange(new Set());
                this.highlightGroup(new Set());
            }
        });
        
        // Prevent default context menu to allow Right-Click panning
        this.svg.on('contextmenu', (e) => e.preventDefault());
        
        // Add Brush Layer behind nodes
        this.brushLayer = this.svg.append('g').attr('class', 'brush');
        this.brush = d3.brush()
            .filter(event => !event.ctrlKey && event.button === 0) // Explicit Left click only
            .extent([[0, 0], [window.innerWidth, window.innerHeight]])
            .on('start brush end', (e) => {
                if (!e.selection) {
                    if (e.type === 'end' && this.onSelectionChange) {
                        // Don't clear on end if there's no selection, click handles bg clear
                    }
                    return;
                }
                const [[x0, y0], [x1, y1]] = e.selection;
                const p0 = this.transform.invert([x0, y0]);
                const p1 = this.transform.invert([x1, y1]);
                
                const selected = new Set<string>();
                this.currentNodes.forEach(n => {
                    if (n.x !== undefined && n.y !== undefined && 
                        n.x >= p0[0] && n.x <= p1[0] && n.y >= p0[1] && n.y <= p1[1]) {
                        selected.add(n.id);
                    }
                });
                
                this.highlightGroup(selected);
                if (this.onSelectionChange) this.onSelectionChange(selected);
                
                // Clear brush visual on end
                if (e.type === 'end') {
                    this.brushLayer.call(this.brush.move, null);
                }
            });
        this.brushLayer.call(this.brush);

        this.g = this.svg.append('g');
        const zoom = d3.zoom<SVGSVGElement, any>()
            .filter((event) => {
                // Allow wheel and right-click (button 2) for zoom/pan
                return event.type === 'wheel' || event.button === 2;
            })
            .on('zoom', (e) => {
                this.transform = e.transform;
                this.g.attr('transform', e.transform.toString());
                this.renderCanvas();
            });
        this.svg.call(zoom);
        
        // Initial Camera Position: Center (0,0) in the viewport
        const initialTransform = d3.zoomIdentity.translate(window.innerWidth / 2, window.innerHeight / 2);
        this.svg.call(zoom.transform, initialTransform);

        this.linkLayer = this.g.append('g');
        this.nodeLayer = this.g.append('g');
        this.setupMarkers();
        window.addEventListener('resize', () => this.onResize());
    }

    onGroupSelect(callback: (ids: Set<string>) => void) {
        this.onSelectionChange = callback;
    }

    highlightGroup(ids: Set<string>) {
        if (this.nodeSelection) {
            this.nodeSelection.select('path')
                .attr('stroke', (d: any) => ids.has(d.id) ? '#00ffff' : (d.isAuthority ? '#ffd700' : (d.status === 'planned' ? '#ffffff' : '#000')))
                .attr('stroke-width', (d: any) => ids.has(d.id) ? 3 : (d.isAuthority ? 2.5 : (d.status === 'planned' ? 2 : 1.5)))
                .style('filter', (d: any) => ids.has(d.id) ? 'drop-shadow(0px 0px 6px rgba(0, 255, 255, 0.8))' : 'none');
        }
    }

    private setupMarkers() {
        this.svg.append('defs').append('marker')
            .attr('id', 'arrow').attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('refY', 0)
            .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
            .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#ffffff').attr('opacity', 0.8);

        // --- SVG DEFS (Hatching Pattern) ---
        const defs = this.svg.select('defs');
        defs.append('pattern')
            .attr('id', 'hatch-authority')
            .attr('width', 8)
            .attr('height', 8)
            .attr('patternUnits', 'userSpaceOnUse')
            .attr('patternTransform', 'rotate(45)')
            .append('rect')
            .attr('width', 4)
            .attr('height', 8)
            .attr('fill', '#ffd700')
            .attr('opacity', 0.6);
    }

    private onResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.brush.extent([[0, 0], [window.innerWidth, window.innerHeight]]);
        this.brushLayer.call(this.brush);
        this.renderCanvas();
    }

    draw(nodes: VisualNode[], links: VisualLink[], weightMap: Map<string, number>, onClick: (n: VisualNode) => void, dragBehavior?: any) {
        this.currentLinks = links;
        this.currentNodes = nodes;
        this.weightMap = weightMap;

        // Render Essential Links (Gravity) in SVG for arrows
        const gravityLinks = links.filter(l => l.isGravity);
        const l = this.linkLayer.selectAll('line').data(gravityLinks, (d: any) => `${d.source.id || d.source}-${d.target.id || d.target}`);
        l.exit().remove();
        const lEnter = l.enter().append('line')
            .attr('stroke', '#ffffff')
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', (d: any) => {
                const targetNode = nodes.find(n => n.id === (d.target.id || d.target));
                const mass = targetNode?.descendantCount || 0;
                return 1 + Math.log10(mass + 1) * 2;
            })
            .attr('marker-end', 'url(#arrow)');
        this.linkSelection = lEnter.merge(l as any) as any;

        // Render Nodes (SVG)
        const n = this.nodeLayer.selectAll('g').data(nodes, (d: any) => d.id);
        n.exit().remove();
        
        const nEnter = n.enter().append('g').attr('cursor', 'pointer')
            .on('mousedown', (e) => { e.stopPropagation(); }) // Prevent brush from stealing node drags
            .on('click', (e, d) => { e.stopPropagation(); onClick(d); });

        if (dragBehavior) nEnter.call(dragBehavior);
        
        // --- ADDITIVE LAYER (INHERITANCE) ---
        nEnter.filter(d => (d.baseClasses?.length || 0) > 0).append('circle')
            .attr('r', d => d.radius + 8).attr('fill', 'none')
            .attr('stroke', '#BF00FF').attr('stroke-width', 2.5).attr('stroke-dasharray', '3,6').attr('opacity', 0.6);

        // --- GUARDIAN HALO (AUTHORITY) ---
        // Solid Halo for 'guarded'
        nEnter.filter(d => d.guardState === 'guarded').append('circle')
            .attr('r', d => d.radius + 14).attr('fill', 'none')
            .attr('stroke', '#ffd700').attr('stroke-width', 4.5).attr('opacity', 0.9)
            .style('filter', 'drop-shadow(0px 0px 4px rgba(255, 215, 0, 0.5))')
            .attr('class', 'guardian-halo');
            
        // Dashed Halo for 'restricted'
        nEnter.filter(d => d.guardState === 'restricted').append('circle')
            .attr('r', d => d.radius + 14).attr('fill', 'none')
            .attr('stroke', '#ffd700').attr('stroke-width', 3).attr('stroke-dasharray', '4,4').attr('opacity', 0.7)
            .attr('class', 'guardian-halo');

        // --- DYNAMIC GEOMETRY ---
        nEnter.append('path')
            .attr('d', d => this.getPathForType(d.type, d.radius))
            .attr('fill', d => d.isAuthority ? 'url(#hatch-authority)' : d.color)
            .attr('stroke', d => d.isAuthority ? '#ffd700' : (d.status === 'planned' ? '#ffffff' : '#000'))
            .attr('stroke-width', d => d.isAuthority ? 2.5 : (d.status === 'planned' ? 2 : 1.5))
            .attr('stroke-dasharray', d => d.status === 'planned' ? '4,4' : 'none')
            .attr('opacity', d => d.status === 'planned' ? 0.6 : 1);
        
        nEnter.append('text').text(d => d.name).attr('text-anchor', 'middle').attr('dy', '0.35em')
            .attr('fill', '#fff')
            .attr('font-size', d => d.radius > 40 ? '14px' : '9px').attr('font-weight', '700').style('pointer-events', 'none');
        
        // --- MISSING DATA WARNING ---
        nEnter.filter(d => !d.purpose || !d.description)
            .append('text')
            .text('⚠️')
            .attr('text-anchor', 'middle')
            .attr('dy', d => `-${d.radius + 8}px`)
            .attr('font-size', '16px')
            .style('pointer-events', 'none')
            .style('filter', 'drop-shadow(0px 2px 2px rgba(0,0,0,0.8))');
        
        this.nodeSelection = nEnter.merge(n as any) as any;
        this.renderCanvas();
    }

    ticking() {
        if (this.nodeSelection) {
            this.nodeSelection.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
        }
        
        if (this.linkSelection) {
            this.linkSelection
                .attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => {
                    const s = d.source; const t = d.target;
                    const dx = t.x - s.x; const dy = t.y - s.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    return t.x - (dx / dist) * (t.radius + 10);
                })
                .attr('y2', (d: any) => {
                    const s = d.source; const t = d.target;
                    const dx = t.x - s.x; const dy = t.y - s.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    return t.y - (dy / dist) * (t.radius + 10);
                });
        }
        this.renderCanvas();
    }

    private renderCanvas() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.translate(this.transform.x, this.transform.y);
        this.ctx.scale(this.transform.k, this.transform.k);

        const nonGravityLinks = this.currentLinks.filter(l => !l.isGravity);
        nonGravityLinks.forEach(l => {
            const s = l.source as any;
            const t = l.target as any;
            if (!s || !t || s.x === undefined || t.x === undefined) return;

            // Highlight if either end is the selected node AND the other end is in focus path
            const isRelevant = (s.id === this.selectedNodeId || t.id === this.selectedNodeId);
            const isHighlighted = isRelevant && this.focusedNodeIds.has(s.id) && this.focusedNodeIds.has(t.id);

            this.ctx.beginPath();
            this.ctx.moveTo(s.x, s.y);
            this.ctx.lineTo(t.x, t.y);
            
            if (isHighlighted) {
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([]); // Solid highlight for clarity or keep dotted
                this.ctx.stroke();
            } else {
                this.ctx.strokeStyle = 'rgba(100, 116, 139, 0.1)';
                this.ctx.lineWidth = 1;
                this.ctx.setLineDash([8, 4]);
                this.ctx.stroke();
            }
        });

        this.ctx.restore();
    }

    private getPathForType(type: string, r: number): string {
        switch (type) {
            case 'System':
                const sr = 10;
                return `M ${-r+sr},${-r} 
                        L ${r-sr},${-r} Q ${r},${-r} ${r},${-r+sr} 
                        L ${r},${r-sr} Q ${r},${r} ${r-sr},${r} 
                        L ${-r+sr},${r} Q ${-r},${r} ${-r},${r-sr} 
                        L ${-r},${-r+sr} Q ${-r},${-r} ${-r+sr},${-r} Z`;
            case 'Service': return this.getRoundedPolygonPath(6, r, 12);
            case 'Component': return this.getRoundedPolygonPath(4, r * 1.2, 15, Math.PI / 2);
            case 'Interface': return this.getRoundedPolygonPath(8, r, 10);
            case 'Data':
            case 'DTO':
            default:
                return `M 0,0 m ${-r},0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-(r * 2)},0`;
        }
    }

    private getRoundedPolygonPath(sides: number, radius: number, cornerRadius: number, rotation: number = 0): string {
        const points = [];
        for (let i = 0; i < sides; i++) {
            const angle = (i * (360 / sides)) * (Math.PI / 180) + rotation;
            points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
        }
        let path = "";
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            const p0 = points[(i - 1 + points.length) % points.length];
            const d1x = p1.x - p0.x; const d1y = p1.y - p0.y;
            const d2x = p2.x - p1.x; const d2y = p2.y - p1.y;
            const l1 = Math.sqrt(d1x * d1x + d1y * d1y);
            const l2 = Math.sqrt(d2x * d2x + d2y * d2y);
            const c = Math.min(cornerRadius, l1 / 2, l2 / 2);
            const startX = p1.x - (d1x / l1) * c;
            const startY = p1.y - (d1y / l1) * c;
            const endX = p1.x + (d2x / l2) * c;
            const endY = p1.y + (d2y / l2) * c;
            if (i === 0) path += `M ${startX},${startY}`;
            else path += ` L ${startX},${startY}`;
            path += ` Q ${p1.x},${p1.y} ${endX},${endY}`;
        }
        return path + " Z";
    }

    focus(selectedId: string, ids: Set<string>) {
        this.selectedNodeId = selectedId;
        this.focusedNodeIds = ids;

        if (this.nodeSelection) {
            this.nodeSelection.transition().duration(250).style('opacity', (d: any) => ids.has(d.id) ? 1 : 0.05);
        }
        if (this.linkSelection) {
            this.linkSelection.transition().duration(250).style('opacity', (d: any) => ids.has(d.source.id) && ids.has(d.target.id) ? 1 : 0.02);
        }
        this.renderCanvas();
    }

    enableDrag(dragBehavior: any) {
        if (this.nodeSelection) {
            this.nodeSelection.call(dragBehavior);
        }
    }

    reset() {
        this.selectedNodeId = null;
        this.focusedNodeIds.clear();

        if (this.nodeSelection) {
            this.nodeSelection.transition().duration(250).style('opacity', 1);
        }
        if (this.linkSelection) {
            this.linkSelection.transition().duration(250).style('opacity', 0.2);
        }
        this.renderCanvas();
    }
}
