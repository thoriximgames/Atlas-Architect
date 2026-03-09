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

    const [plannedRes, stateRes] = await Promise.all([
        fetch('/api/blueprint'), // Get initial blueprint
        fetch('/api/topology/state')
    ]);
    
    let plannedData = await plannedRes.json();
    let stateData = await stateRes.json();
    let currentMode: 'architecture' | 'plan' = 'architecture';

    const updateLockBadge = (locked: boolean, mode: string) => {
        const badge = document.getElementById('lock-badge');
        const overlay = document.getElementById('blueprint-lock-overlay');
        const btnArch = document.getElementById('btn-mode-architecture');
        const btnPlan = document.getElementById('btn-mode-plan');
        const canvas = document.getElementById('visualizer-canvas');

        console.log(`[Atlas] Updating Lock UI - Locked: ${locked}, Mode: ${mode}`);

        if (locked) {
            if (btnArch) {
                btnArch.classList.add('locked-label');
                btnArch.innerText = "BLUEPRINT (LOCKED)";
            }
            if (mode === 'architecture') {
                if (badge) badge.style.display = 'flex';
                if (overlay) overlay.style.display = 'block';
                if (canvas) canvas.style.pointerEvents = 'none'; // Lock Canvas Interaction
                btnPlan?.classList.add('pulse-planning');
            } else {
                if (badge) badge.style.display = 'none';
                if (overlay) overlay.style.display = 'none';
                if (canvas) canvas.style.pointerEvents = 'all'; // Restore Canvas Interaction
                btnPlan?.classList.remove('pulse-planning');
            }
        } else {
            if (badge) badge.style.display = 'none';
            if (overlay) overlay.style.display = 'none';
            if (canvas) canvas.style.pointerEvents = 'all'; // Restore Canvas Interaction
            if (btnArch) {
                btnArch.classList.remove('locked-label');
                btnArch.innerText = "BLUEPRINT";
            }
            btnPlan?.classList.remove('pulse-planning');
        }
    };

    updateLockBadge(stateData.locked, currentMode);

    if (plannedData.project) {
        document.title = `Atlas | ${plannedData.project}`;
        const projectLabel = document.getElementById('project-label');
        if (projectLabel) projectLabel.innerText = `ATLAS | ${plannedData.project.toUpperCase()}`;
    }

    const nodeMap = new Map<string, VisualNode>();
    let activeNodes: VisualNode[] = [];
    let activeLinks: any[] = [];

    const calculateNodes = (pData: any) => {
        const pNodesRaw = Array.isArray(pData) ? pData : (pData.plannedNodes || []);

        const blueprintChildrenMap = new Map<string, number>();
        pNodesRaw.forEach((pn: any) => {
            if (pn.parentId) {
                blueprintChildrenMap.set(pn.parentId, (blueprintChildrenMap.get(pn.parentId) || 0) + 1);
            }
        });

        return pNodesRaw.map((pn: any) => {
            const bChildCount = blueprintChildrenMap.get(pn.id) || 0;
            const effectiveDescendants = Math.max(pn.descendantCount || 0, bChildCount);
            const hasPos = pn.x !== undefined && pn.y !== undefined;
            
            return {
                ...pn,
                descendantCount: effectiveDescendants,
                depth: pn.parentId && pn.parentId !== '_UNCONNECTED_' ? 2 : 1,
                x: hasPos ? pn.x : 0, y: hasPos ? pn.y : 0, 
                initialX: hasPos ? pn.x : 0, initialY: hasPos ? pn.y : 0, 
                radius: 20 + Math.sqrt(effectiveDescendants) * 6,
                fx: hasPos ? pn.x : undefined, fy: hasPos ? pn.y : undefined
            } as VisualNode;
        });
    };

    const rebuildGraphData = (pData: any) => {
        activeNodes = calculateNodes(pData);
        activeLinks = [];
        activeNodes.forEach(n => {
            if (n.parentId) activeLinks.push({ source: n.parentId, target: n.id, isGravity: true, type: 'inheritance' });
            if (n.dependencies) n.dependencies.forEach(dep => activeLinks.push({ source: n.id, target: dep, isGravity: false, type: 'dependency' }));
        });

        nodeMap.clear();
        activeNodes.forEach(n => nodeMap.set(n.id, n));
    };

    rebuildGraphData(plannedData);

    const inspector = new Inspector();
    const legend = new Legend();
    const renderer = new StageRenderer(() => { 
        renderer.reset(); inspector.clear(); 
        document.getElementById('sidebar')?.classList.add('hidden');
        document.getElementById('node-toolbox')?.classList.add('hidden');
    });

    const handleSync = async () => {
        await fetch('/api/topology/sync', { method: 'POST' });
        
        const bpRes = await fetch(`/api/blueprint${currentMode === 'plan' ? '?mode=plan' : ''}`);
        plannedData = await bpRes.json();

        rebuildGraphData(plannedData);
        engine.resetData(activeNodes, activeLinks);
        renderer.centerView(activeNodes);
    };

    const toolbar = new Toolbar(handleSync);

    const switchPage = async (page: 'architecture' | 'plan') => {
        currentMode = page;
        engine.stopBootstrap(); renderer.reset(); inspector.clear();

        const [res, stateRes] = await Promise.all([
            fetch(`/api/blueprint${page === 'plan' ? '?mode=plan' : ''}`),
            fetch('/api/topology/state')
        ]);
        plannedData = await res.json();
        const stateData = await stateRes.json();
        
        updateLockBadge(stateData.locked, page);
        
        rebuildGraphData(plannedData);
        engine.resetData(activeNodes, activeLinks);
        renderer.centerView(activeNodes);

        const btnArch = document.getElementById('btn-mode-architecture');
        const btnPlan = document.getElementById('btn-mode-plan');
        const btnMerge = document.getElementById('btn-merge-plan');
        const divMerge = document.getElementById('divider-merge');
        
        if (page === 'architecture') {
            btnArch?.classList.add('active'); btnPlan?.classList.remove('active');
            btnMerge?.classList.add('hidden');
            divMerge?.classList.add('hidden');
            document.body.classList.remove('planning-mode');
            toolbar.setActiveStage("");
        } else {
            btnPlan?.classList.add('active'); btnArch?.classList.remove('active');
            btnMerge?.classList.remove('hidden');
            divMerge?.classList.remove('hidden');
            document.body.classList.add('planning-mode');
            toolbar.setActiveStage("EVOLUTION");
        }
        if (window.location.hash !== `#${page}`) history.pushState(null, '', `#${page}`);
    };

    document.getElementById('btn-mode-architecture')?.addEventListener('click', () => switchPage('architecture'));
    document.getElementById('btn-mode-plan')?.addEventListener('click', () => switchPage('plan'));
    document.getElementById('btn-switch-to-plan-now')?.addEventListener('click', () => switchPage('plan'));
    
    document.getElementById('btn-merge-plan')?.addEventListener('click', async () => {
        if (confirm("Merge Active Plan into Authoritative Blueprint?")) {
            const res = await fetch('/api/plan/merge', { method: 'POST' });
            if (res.ok) {
                alert("Merge successful!");
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

    const resolveAncestryPath = (targetId: string, nodeMap: Map<string, VisualNode>): Set<string> => {
        const pathIds = new Set<string>();
        let currentId: string | undefined = targetId;

        while (currentId) {
            pathIds.add(currentId);
            const node = nodeMap.get(currentId);
            currentId = node?.parentId;
            if (currentId && pathIds.has(currentId)) break; // Prevent infinite loops
        }
        return pathIds;
    };

    const onNodeClick = (_: any, node: VisualNode) => {
        const pathIds = resolveAncestryPath(node.id, nodeMap);
        renderer.focus(node.id, pathIds);
        inspector.render(node);
        document.getElementById('sidebar')?.classList.remove('hidden');
    };

    const handleRoute = () => {
        const hash = window.location.hash.replace('#', '') || 'architecture';
        switchPage(hash === 'plan' ? 'plan' : 'architecture');
    };

    window.addEventListener('popstate', handleRoute);
    handleRoute();

    const refreshLockState = async () => {
        const stateRes = await fetch('/api/topology/state');
        const stateData = await stateRes.json();
        updateLockBadge(stateData.locked, currentMode);
    };

    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (e) => { 
        const payload = JSON.parse(e.data);
        if (payload.type === 'scan-complete') handleSync(); 
        if (payload.type === 'lock-state-changed') refreshLockState();
    };
}
bootstrap();