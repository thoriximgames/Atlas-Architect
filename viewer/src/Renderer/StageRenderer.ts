import * as d3 from 'd3';
import { VisualNode, VisualLink } from '../Protocol/VisualTypes';
import { ThemeManager } from '../Theme/ThemeManager';

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
    private zoom: d3.ZoomBehavior<SVGSVGElement, any>;
    private focusedNodeIds: Set<string> = new Set();
    private selectedNodeId: string | null = null;
    private brush: d3.BrushBehavior<unknown>;
    private onSelectionChange?: (ids: Set<string>) => void;

    constructor(onBgClick: () => void) {
        const container = d3.select('#visualizer-canvas');
        
        this.canvas = container.append('canvas')
            .style('position', 'absolute')
            .style('top', '0').style('left', '0')
            .attr('width', window.innerWidth)
            .attr('height', window.innerHeight)
            .node() as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

        this.svg = container.append('svg')
            .style('position', 'absolute')
            .style('top', '0').style('left', '0')
            .attr('width', '100%').attr('height', '100%');
            
        this.svg.on('click', (e) => { 
            if (e.target === this.svg.node() || d3.select(e.target).classed('overlay')) {
                onBgClick(); 
                if (this.onSelectionChange) this.onSelectionChange(new Set());
                this.highlightGroup(new Set());
            }
        });
        
        this.svg.on('contextmenu', (e) => e.preventDefault());
        this.brushLayer = this.svg.append('g').attr('class', 'brush');
        this.brush = d3.brush()
            .filter(event => !event.ctrlKey && event.button === 0)
            .extent([[0, 0], [window.innerWidth, window.innerHeight]])
            .on('start brush end', (e) => {
                if (!e.selection) return;
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
                if (e.type === 'end') this.brushLayer.call(this.brush.move, null);
            });
        this.brushLayer.call(this.brush);

        this.g = this.svg.append('g');
        this.zoom = d3.zoom<SVGSVGElement, any>()
            .filter((event) => event.type === 'wheel' || event.button === 2)
            .on('zoom', (e) => {
                this.transform = e.transform;
                this.g.attr('transform', e.transform.toString());
                this.renderCanvas();
            });
        this.svg.call(this.zoom);
        const initialTransform = d3.zoomIdentity.translate(window.innerWidth / 2, window.innerHeight / 2);
        this.svg.call(this.zoom.transform, initialTransform);

        this.linkLayer = this.g.append('g');
        this.nodeLayer = this.g.append('g');
        this.setupMarkers();
        window.addEventListener('resize', () => this.onResize());
    }

    centerView(nodes: VisualNode[], instant: boolean = false) {
        if (!nodes || nodes.length === 0) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let count = 0;
        nodes.forEach(n => {
            if (n.x !== undefined && n.y !== undefined) {
                const r = n.radius || 20;
                minX = Math.min(minX, n.x - r);
                maxX = Math.max(maxX, n.x + r);
                minY = Math.min(minY, n.y - r);
                maxY = Math.max(maxY, n.y + r);
                count++;
            }
        });

        if (count === 0) return;

        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;
        const padding = 120; // total padding in pixels

        const graphWidth = (maxX - minX) || 1;
        const graphHeight = (maxY - minY) || 1;

        const scaleX = (viewWidth - padding) / graphWidth;
        const scaleY = (viewHeight - padding) / graphHeight;
        let k = Math.min(scaleX, scaleY);
        
        // Clamp scale: don't zoom in too much, and don't zoom out too much
        k = Math.min(1.2, Math.max(0.15, k));

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const nextTransform = d3.zoomIdentity
            .translate(viewWidth / 2 - centerX * k, viewHeight / 2 - centerY * k)
            .scale(k);

        if (instant) {
            this.svg.call(this.zoom.transform, nextTransform);
        } else {
            this.svg.transition().duration(850).ease(d3.easeCubicInOut).call(this.zoom.transform, nextTransform);
        }
    }

    onGroupSelect(callback: (ids: Set<string>) => void) {
        this.onSelectionChange = callback;
    }

    get selectedId(): string | null { return this.selectedNodeId; }

    private setupMarkers() {
        this.svg.append('defs').append('marker')
            .attr('id', 'arrow').attr('viewBox', '0 -5 10 10').attr('refX', 8).attr('refY', 0)
            .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
            .append('path').attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', ThemeManager.connectorNormal)
            .attr('opacity', 1);

        const defs = this.svg.select('defs');
        const filter = defs.append('filter')
            .attr('id', 'node-shadow')
            .attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
        filter.append('feDropShadow')
            .attr('dx', '0').attr('dy', '2')
            .attr('stdDeviation', '2')
            .attr('flood-color', 'rgba(0,0,0,0.15)');

        defs.append('pattern')
            .attr('id', 'hatch-authority')
            .attr('width', 8).attr('height', 8)
            .attr('patternUnits', 'userSpaceOnUse')
            .attr('patternTransform', 'rotate(45)')
            .append('rect')
            .attr('width', 4).attr('height', 8)
            .attr('fill', '#FFCD29').attr('opacity', 1);
    }

    private onResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.brush.extent([[0, 0], [window.innerWidth, window.innerHeight]]);
        this.brushLayer.call(this.brush);
        this.renderCanvas();
    }

    private renderCanvas() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 1. Draw Optimized Tiled Grid
        this.drawTiledGrid();

        this.ctx.save();
        this.ctx.translate(this.transform.x, this.transform.y);
        this.ctx.scale(this.transform.k, this.transform.k);

        // 2. Draw Non-Gravity Links
        const nonGravityLinks = this.currentLinks.filter(l => !l.isGravity);
        const hasSelection = this.selectedNodeId !== null || this.focusedNodeIds.size > 0;

        nonGravityLinks.forEach(l => {
            const s = l.source as any;
            const t = l.target as any;
            if (!s || !t || s.x === undefined || t.x === undefined) return;

            const isHighlighted = (s.id === this.selectedNodeId || t.id === this.selectedNodeId) && this.focusedNodeIds.has(s.id) && this.focusedNodeIds.has(t.id);
            if (hasSelection && !isHighlighted) return;

            this.ctx.beginPath();
            this.ctx.moveTo(s.x, s.y);
            this.ctx.lineTo(t.x, t.y);
            
            this.ctx.strokeStyle = isHighlighted ? ThemeManager.connectorSelected : ThemeManager.connectorNormal;
            this.ctx.lineWidth = isHighlighted ? 3 : 1.5;
            this.ctx.setLineDash(isHighlighted ? [] : [8, 6]);
            this.ctx.stroke();
        });

        this.ctx.restore();
    }

    private drawTiledGrid() {
        const k = this.transform.k;
        const tx = this.transform.x;
        const ty = this.transform.y;
        const spacing = 20 * k;
        
        if (spacing < 2) return; // Performance guard

        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = spacing;
        patternCanvas.height = spacing;
        const pctx = patternCanvas.getContext('2d')!;
        
        pctx.fillStyle = ThemeManager.gridColor;
        const dotSize = Math.max(0.5, 1 * k);
        pctx.beginPath();
        pctx.arc(spacing/2, spacing/2, dotSize, 0, Math.PI * 2);
        pctx.fill();

        const pattern = this.ctx.createPattern(patternCanvas, 'repeat');
        if (pattern) {
            this.ctx.save();
            this.ctx.translate(tx % spacing, ty % spacing);
            this.ctx.fillStyle = pattern;
            this.ctx.fillRect(-spacing, -spacing, this.canvas.width + spacing * 2, this.canvas.height + spacing * 2);
            this.ctx.restore();
        }
    }

    draw(nodes: VisualNode[], links: VisualLink[], weightMap: Map<string, number>, onClick: (e: MouseEvent, n: VisualNode) => void, dragBehavior?: any) {
        this.currentLinks = links;
        this.currentNodes = nodes;
        this.weightMap = weightMap;

        const gravityLinks = links.filter(l => l.isGravity);
        const l = this.linkLayer.selectAll('line').data(gravityLinks, (d: any) => `${d.source.id || d.source}-${d.target.id || d.target}`);
        l.exit().remove();
        const lEnter = l.enter().append('line')
            .attr('stroke', ThemeManager.connectorNormal)
            .attr('stroke-opacity', 1)
            .attr('stroke-width', 2.5)
            .attr('marker-end', 'url(#arrow)');
        this.linkSelection = lEnter.merge(l as any) as any;

        const n = this.nodeLayer.selectAll('g').data(nodes, (d: any) => d.id);
        n.exit().remove();
        
        const nEnter = n.enter().append('g').attr('cursor', 'pointer')
            .on('mousedown', (e) => { e.stopPropagation(); }) 
            .on('click', (e, d) => { e.stopPropagation(); onClick(e, d); });

        if (dragBehavior) nEnter.call(dragBehavior);
        
        nEnter.filter(d => (d.baseClasses?.length || 0) > 0).append('path')
            .attr('d', d => this.getPathForType(d.type, d.radius + 6))
            .attr('fill', 'none')
            .attr('stroke', '#A259FF')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,4');

        nEnter.filter(d => d.guardState === 'guarded').append('circle')
            .attr('r', d => d.radius + 14).attr('fill', 'none')
            .attr('stroke', '#FFCD29').attr('stroke-width', 3)
            .attr('class', 'guardian-halo');

        nEnter.append('path')
            .attr('class', 'main-shape')
            .attr('d', d => this.getPathForType(d.type, d.radius))
            .attr('fill', d => d.isAuthority ? 'url(#hatch-authority)' : ThemeManager.getStyle(d.type).fill)
            .attr('stroke', d => {
                if (d.isAuthority) return '#FFCD29';
                if (d.status === 'planned') return '#808080';
                return 'none'; 
            })
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', d => d.status === 'planned' ? '4,4' : 'none')
            .style('filter', 'url(#node-shadow)');
        
        nEnter.append('text').text(d => d.name).attr('text-anchor', 'middle').attr('dy', '0.35em')
            .attr('fill', d => ThemeManager.getStyle(d.type).text)
            .attr('font-size', d => d.radius > 40 ? '13px' : '10px').attr('font-weight', '700').style('pointer-events', 'none');
        
        // --- MISSING DATA WARNING ---
        nEnter.filter((d: any) => !d.purpose || !d.description || d.purpose === 'Auto-discovered dependency')
            .append('text')
            .text('⚠️')
            .attr('text-anchor', 'middle')
            .attr('dy', (d: any) => `-${(d.radius || 20) + 8}px`)
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
                    return t.x - (dx / dist) * (t.radius + 8);
                })
                .attr('y2', (d: any) => {
                    const s = d.source; const t = d.target;
                    const dx = t.x - s.x; const dy = t.y - s.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    return t.y - (dy / dist) * (t.radius + 8);
                });
        }
        this.renderCanvas();
        this.updateToolbox();
    }

    private getPathForType(type: string, r: number): string {
        switch (type) {
            case 'System':
                const sr = 10;
                return `M ${-r+sr},${-r} L ${r-sr},${-r} Q ${r},${-r} ${r},${-r+sr} L ${r},${r-sr} Q ${r},${r} ${r-sr},${r} L ${-r+sr},${r} Q ${-r},${r} ${-r},${r-sr} L ${-r},${-r+sr} Q ${-r},${-r} ${-r+sr},${-r} Z`;
            case 'Service': return this.getRoundedPolygonPath(6, r, 12);
            case 'Component': return this.getRoundedPolygonPath(4, r * 1.2, 15, Math.PI / 2);
            case 'Interface': return this.getRoundedPolygonPath(8, r, 10);
            default: return `M 0,0 m ${-r},0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-(r * 2)},0`;
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
            const p1 = points[i]; const p2 = points[(i + 1) % points.length]; const p0 = points[(i - 1 + points.length) % points.length];
            const d1x = p1.x - p0.x; const d1y = p1.y - p0.y; const d2x = p2.x - p1.x; const d2y = p2.y - p1.y;
            const l1 = Math.sqrt(d1x * d1x + d1y * d1y); const l2 = Math.sqrt(d2x * d2x + d2y * d2y);
            const c = Math.min(cornerRadius, l1 / 2, l2 / 2);
            const startX = p1.x - (d1x / l1) * c; const startY = p1.y - (d1y / l1) * c;
            const endX = p1.x + (d2x / l2) * c; const endY = p1.y + (d2y / l2) * c;
            if (i === 0) path += `M ${startX},${startY}`; else path += ` L ${startX},${startY}`;
            path += ` Q ${p1.x},${p1.y} ${endX},${endY}`;
        }
        return path + " Z";
    }

    highlightGroup(ids: Set<string>) {
        if (this.nodeSelection) {
            this.nodeSelection.select('.main-shape')
                .attr('stroke', (d: any) => {
                    if (ids.has(d.id)) return ThemeManager.selectionBlue;
                    if (d.isAuthority) return '#FFCD29';
                    if (d.status === 'planned') return '#808080';
                    return 'none';
                })
                .attr('stroke-width', (d: any) => ids.has(d.id) ? 5 : 2);
        }
        if (this.linkSelection) {
            this.linkSelection
                .attr('stroke', (d: any) => ids.has(d.source.id || d.source) && ids.has(d.target.id || d.target) ? ThemeManager.connectorSelected : ThemeManager.connectorNormal)
                .attr('stroke-width', (d: any) => ids.has(d.source.id || d.source) && ids.has(d.target.id || d.target) ? 3.5 : 2.5);
        }
    }

    focus(selectedId: string, ids: Set<string>) {
        this.selectedNodeId = selectedId;
        this.focusedNodeIds = ids;

        if (this.nodeSelection) {
            this.nodeSelection.transition().duration(250).style('opacity', (d: any) => ids.has(d.id) ? 1 : 0.05);
        }
        if (this.linkSelection) {
            this.linkSelection.transition().duration(250).style('opacity', (d: any) => ids.has(d.source.id) && ids.has(d.target.id) ? 1 : 0);
        }
        this.renderCanvas();
        this.updateToolbox();
    }

    private updateToolbox() {
        const toolbox = document.getElementById('node-toolbox');
        if (!toolbox || !this.selectedNodeId) {
            toolbox?.classList.add('hidden');
            return;
        }

        const node = this.currentNodes.find(n => n.id === this.selectedNodeId);
        if (node && node.x !== undefined && node.y !== undefined) {
            const screenX = this.transform.x + node.x * this.transform.k;
            const screenY = this.transform.y + node.y * this.transform.k;
            toolbox.classList.remove('hidden');
            const offset = ((node.radius || 20) + 20) * this.transform.k;
            toolbox.style.left = `${screenX}px`;
            toolbox.style.top = `${screenY - offset}px`;
            toolbox.style.transform = 'translateX(-50%)';
        } else {
            toolbox.classList.add('hidden');
        }
    }

    enableDrag(dragBehavior: any) {
        if (this.nodeSelection) this.nodeSelection.call(dragBehavior);
    }

    reset() {
        this.selectedNodeId = null;
        this.focusedNodeIds.clear();
        const toolbox = document.getElementById('node-toolbox');
        toolbox?.classList.add('hidden');
        if (this.nodeSelection) {
            this.nodeSelection.transition().duration(250).style('opacity', 1);
        }
        if (this.linkSelection) {
            this.linkSelection.transition().duration(250).style('opacity', 1);
            this.linkSelection.attr('stroke', ThemeManager.connectorNormal).attr('stroke-width', 2.5);
        }
        this.renderCanvas();
    }
}
