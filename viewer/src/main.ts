import * as d3 from 'd3';
import { GalaxyEngine } from './Engine/GalaxyEngine';
import { StageRenderer } from './Renderer/StageRenderer';
import { Inspector } from './UI/Inspector';
import { Legend } from './UI/Legend';
import { Toolbar } from './UI/Toolbar';
import { VisualNode, VisualLink } from './Protocol/VisualTypes';
import { ThemeManager } from './Theme/ThemeManager';
import './style.css';

async function bootstrap() {
    await ThemeManager.loadConfig();
    
    // Auto-sync on load
    try {
        await fetch('/api/topology/sync', { method: 'POST' });
    } catch (e) {
        console.warn('[Atlas] Auto-sync failed', e);
    }

    const [realityRes, plannedRes] = await Promise.all([
        fetch('/data/reality.json'),
        fetch('/api/blueprint') // Get initial blueprint
    ]);
    
    let realityData = await realityRes.json();
    let plannedData = await plannedRes.json();
    let currentMode: 'architecture' | 'stage' = 'architecture';

    if (realityData.project) {
        document.title = `Atlas | ${realityData.project}`;
        const projectLabel = document.getElementById('project-label');
        if (projectLabel) projectLabel.innerText = `ATLAS | ${realityData.project.toUpperCase()}`;
    }

    const nodeMap = new Map<string, VisualNode>();
    let activeNodes: VisualNode[] = [];
    let activeLinks: any[] = [];

    const calculateNodes = (pData: any, rData: any) => {
        const rNodes = Object.values(rData.nodes || {}) as VisualNode[];
        const pNodesRaw = Array.isArray(pData) ? pData : (pData.plannedNodes || []);
        const rMap = new Map<string, VisualNode>();
        rNodes.forEach(n => rMap.set(n.id, n));

        const blueprintChildrenMap = new Map<string, number>();
        pNodesRaw.forEach((pn: any) => {
            if (pn.parentId) {
                blueprintChildrenMap.set(pn.parentId, (blueprintChildrenMap.get(pn.parentId) || 0) + 1);
            }
        });

        return pNodesRaw.map((pn: any) => {
            const isReal = rMap.has(pn.id);
            const realNode = rMap.get(pn.id);
            const bChildCount = blueprintChildrenMap.get(pn.id) || 0;
            const effectiveDescendants = Math.max(realNode?.descendantCount || 0, bChildCount);
            const hasPos = pn.x !== undefined && pn.y !== undefined;
            
            return {
                ...pn,
                status: isReal ? 'verified' : 'planned',
                language: realNode?.language || 'Unknown',
                descendantCount: effectiveDescendants,
                complexity: realNode?.complexity || 0,
                methods: realNode?.methods || [],
                fields: realNode?.fields || [],
                events: realNode?.events || [],
                file: realNode?.file || pn.id,
                baseClasses: realNode?.baseClasses || [],
                purpose: pn.purpose || realNode?.purpose || "",
                description: pn.description || realNode?.description || "",
                designIntent: pn.designIntent || realNode?.designIntent || "",
                depth: pn.parentId ? 2 : 1,
                x: hasPos ? pn.x : 0, y: hasPos ? pn.y : 0, 
                initialX: hasPos ? pn.x : 0, initialY: hasPos ? pn.y : 0, 
                radius: 20 + Math.sqrt(effectiveDescendants) * 6,
                fx: hasPos ? pn.x : undefined, fy: hasPos ? pn.y : undefined
            } as VisualNode;
        });
    };

    const rebuildGraphData = (pData: any, rData: any) => {
        activeNodes = calculateNodes(pData, rData);
        activeLinks = [];
        activeNodes.forEach(n => {
            if (n.parentId) activeLinks.push({ source: n.parentId, target: n.id, isGravity: true, type: 'inheritance' });
            if (n.dependencies) n.dependencies.forEach(dep => activeLinks.push({ source: n.id, target: dep, isGravity: false, type: 'dependency' }));
        });

        nodeMap.clear();
        activeNodes.forEach(n => nodeMap.set(n.id, n));
    };

    rebuildGraphData(plannedData, realityData);

    const inspector = new Inspector();
    const legend = new Legend();
    const renderer = new StageRenderer(() => { 
        renderer.reset(); inspector.clear(); 
        document.getElementById('sidebar')?.classList.add('hidden');
        document.getElementById('node-toolbox')?.classList.add('hidden');
    });

    const handleSync = async () => {
        const res = await fetch('/api/topology/sync', { method: 'POST' });
        const data = await res.json();
        realityData = data.realityData;
        
        const bpRes = await fetch(`/api/blueprint${currentMode === 'stage' ? '?mode=stage' : ''}`);
        plannedData = await bpRes.json();

        rebuildGraphData(plannedData, realityData);
        engine.resetData(activeNodes, activeLinks);
        renderer.centerView(activeNodes);
    };

    const toolbar = new Toolbar(handleSync);

    const switchPage = async (page: 'architecture' | 'stage') => {
        currentMode = page;
        engine.stopBootstrap(); renderer.reset(); inspector.clear();

        const res = await fetch(`/api/blueprint${page === 'stage' ? '?mode=stage' : ''}`);
        plannedData = await res.json();
        
        rebuildGraphData(plannedData, realityData);
        engine.resetData(activeNodes, activeLinks);
        renderer.centerView(activeNodes);

        const btnArch = document.getElementById('btn-mode-architecture');
        const btnStage = document.getElementById('btn-mode-stage');
        const btnPromote = document.getElementById('btn-promote-stage');
        const divPromote = document.getElementById('divider-promote');
        
        if (page === 'architecture') {
            btnArch?.classList.add('active'); btnStage?.classList.remove('active');
            btnPromote?.classList.add('hidden');
            divPromote?.classList.add('hidden');
            document.body.classList.remove('planning-mode');
            toolbar.setActiveStage("");
        } else {
            btnStage?.classList.add('active'); btnArch?.classList.remove('active');
            btnPromote?.classList.remove('hidden');
            divPromote?.classList.remove('hidden');
            document.body.classList.add('planning-mode');
            toolbar.setActiveStage("EVOLUTION");
        }
        if (window.location.hash !== `#${page}`) history.pushState(null, '', `#${page}`);
    };

    document.getElementById('btn-mode-architecture')?.addEventListener('click', () => switchPage('architecture'));
    document.getElementById('btn-mode-stage')?.addEventListener('click', () => switchPage('stage'));
    
    document.getElementById('btn-promote-stage')?.addEventListener('click', async () => {
        if (confirm("Promote Planning stage to Authoritative Blueprint?")) {
            const res = await fetch('/api/blueprint/promote', { method: 'POST' });
            if (res.ok) {
                alert("Promotion successful!");
                switchPage('architecture');
            }
        }
    });

    const btnLegend = document.getElementById('btn-toggle-legend');
    const btnCloseLegend = document.getElementById('btn-close-legend');
    const legendPanel = document.getElementById('legend-sidebar');
    btnLegend?.addEventListener('click', () => { legendPanel?.classList.toggle('hidden'); legend.render(); });
    btnCloseLegend?.addEventListener('click', () => legendPanel?.classList.add('hidden'));

    const engine = new GalaxyEngine(activeNodes, activeLinks, () => renderer.ticking(), () => {
        renderer.draw(engine.state.nodes, engine.state.links, engine.state.weightMap, onNodeClick);
        renderer.enableDrag(drag(d3));
    });

    const drag = (d3: any) => {
        function dragstarted(event: any, d: any) {
            if (!event.active) engine.simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
        }
        function dragged(event: any, d: any) {
            d.fx = Math.round(event.x / 25) * 25; d.fy = Math.round(event.y / 25) * 25;
        }
        function dragended(event: any, d: any) {
            if (!event.active) engine.simulation.alphaTarget(0);
            engine.savePositions();
        }
        return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
    };

    const onNodeClick = (_: any, node: VisualNode) => {
        renderer.focus(node.id, new Set([node.id]));
        inspector.render(node);
        document.getElementById('sidebar')?.classList.remove('hidden');
    };

    const handleRoute = () => {
        const hash = window.location.hash.replace('#', '') || 'architecture';
        switchPage(hash === 'stage' ? 'stage' : 'architecture');
    };

    window.addEventListener('popstate', handleRoute);
    handleRoute();

    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (e) => { if (JSON.parse(e.data).type === 'scan-complete') handleSync(); };
}
bootstrap();
