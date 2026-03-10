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
    
    let plannedData: any = { plannedNodes: [] };
    let currentMode: 'architecture' | 'plan' = 'architecture';
    let isLocked = false;

    const nodeMap = new Map<string, VisualNode>();
    let selectedNodeIds = new Set<string>();
    let activeNodes: VisualNode[] = [];
    let activeLinks: any[] = [];

    const inspector = new Inspector();
    const legend = new Legend();
    const renderer = new StageRenderer(() => { 
        renderer.reset(); inspector.clear(); 
        document.getElementById('sidebar')?.classList.add('hidden');
        document.getElementById('node-toolbox')?.classList.add('hidden');
    });

    const updateLockUI = (locked: boolean, mode: string) => {
        const badge = document.getElementById('lock-badge');
        const overlay = document.getElementById('blueprint-lock-overlay');
        const btnArch = document.getElementById('btn-mode-architecture');
        const btnPlan = document.getElementById('btn-mode-plan');
        const canvas = document.getElementById('visualizer-canvas');
        const btnMerge = document.getElementById('btn-merge-plan');
        const divMerge = document.getElementById('divider-merge');

        console.log(`[Atlas] Updating Lock UI - Locked: ${locked}, Mode: ${mode}`);

        if (locked) {
            if (btnArch) {
                btnArch.classList.add('locked-label');
                btnArch.innerText = "BLUEPRINT (LOCKED)";
            }
            if (mode === 'architecture') {
                if (badge) badge.style.display = 'flex';
                if (overlay) overlay.style.display = 'block';
                if (canvas) canvas.style.pointerEvents = 'none';
                btnPlan?.classList.add('pulse-planning');
            } else {
                if (badge) badge.style.display = 'none';
                if (overlay) overlay.style.display = 'none';
                if (canvas) canvas.style.pointerEvents = 'all';
                btnPlan?.classList.remove('pulse-planning');
            }
        } else {
            if (badge) badge.style.display = 'none';
            if (overlay) overlay.style.display = 'none';
            if (canvas) canvas.style.pointerEvents = 'all';
            if (btnArch) {
                btnArch.classList.remove('locked-label');
                btnArch.innerText = "BLUEPRINT";
            }
            btnPlan?.classList.remove('pulse-planning');
        }

        // Mode Switcher Active States
        if (btnArch) btnArch.classList.toggle('active', mode === 'architecture');
        if (btnPlan) btnPlan.classList.toggle('active', mode === 'plan');
        
        // Merge tools
        if (btnMerge) btnMerge.classList.toggle('hidden', mode !== 'plan');
        if (divMerge) divMerge.classList.toggle('hidden', mode !== 'plan');
        
        toolbar.setActiveStage(mode === 'plan' ? "EVOLUTION" : "");
    };

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

    const handleRefresh = async (silent: boolean = false) => {
        const stateRes = await fetch('/api/topology/state');
        const stateData = await stateRes.json();
        isLocked = stateData.locked;

        // Forced redirection if on plan page but no plan active
        if (currentMode === 'plan' && !isLocked) {
            console.warn("[Atlas] No active plan found. Forcing Architecture mode.");
            currentMode = 'architecture';
            if (window.location.hash !== '#architecture') window.location.hash = '#architecture';
        }

        const endpoint = currentMode === 'plan' ? '/api/plan' : '/api/blueprint';
        const res = await fetch(endpoint);
        plannedData = await res.json();

        if (plannedData.project) {
            document.title = `Atlas | ${plannedData.project}`;
            const projectLabel = document.getElementById('project-label');
            if (projectLabel) projectLabel.innerText = `ATLAS | ${plannedData.project.toUpperCase()}`;
        }

        updateLockUI(isLocked, currentMode);
        rebuildGraphData(plannedData);
        engine.setPositionsUrl(`${endpoint}/positions`);
        engine.resetData(activeNodes, activeLinks);
        if (!silent) renderer.centerView(activeNodes);
    };

    const handleSync = async () => {
        await fetch('/api/topology/sync', { method: 'POST' });
        await handleRefresh();
    };

    const toolbar = new Toolbar(handleRefresh, handleSync);

    const switchPage = async (page: 'architecture' | 'plan') => {
        currentMode = page;
        engine.stopBootstrap(); renderer.reset(); inspector.clear();
        await handleRefresh();
        if (window.location.hash !== `#${page}`) history.pushState(null, '', `#${page}`);
    };

    renderer.onGroupSelect((ids) => { selectedNodeIds = ids; });

    document.getElementById('btn-mode-architecture')?.addEventListener('click', () => switchPage('architecture'));
    document.getElementById('btn-mode-plan')?.addEventListener('click', () => switchPage('plan'));
    document.getElementById('btn-switch-to-plan-now')?.addEventListener('click', () => switchPage('plan'));
    
    document.getElementById('btn-merge-plan')?.addEventListener('click', async () => {
        if (confirm("Merge Active Plan into Authoritative Blueprint?")) {
            try {
                const res = await fetch('/api/plan/merge', { method: 'POST' });
                if (res.ok) {
                    alert("Merge successful!");
                    await switchPage('architecture');
                } else {
                    const text = await res.text();
                    let errorMessage = text;
                    try { errorMessage = JSON.parse(text).error || text; } catch (e) {}
                    alert(`MERGE BLOCKED: ${errorMessage}`);
                }
            } catch (err: any) {
                alert(`NETWORK ERROR: ${err.message}`);
            }
        }
    });

    const btnLegend = document.getElementById('btn-toggle-legend');
    const btnCloseLegend = document.getElementById('btn-close-legend');
    const legendPanel = document.getElementById('legend-sidebar');
    btnLegend?.addEventListener('click', () => { legendPanel?.classList.toggle('hidden'); legend.render(); });
    btnCloseLegend?.addEventListener('click', () => legendPanel?.classList.add('hidden'));

    const engine = new GalaxyEngine([], [], () => renderer.ticking(), () => {
        renderer.draw(engine.state.nodes, engine.state.links, engine.state.weightMap, onNodeClick);
        renderer.enableDrag(drag(d3));
    }, '/api/blueprint/positions');

    const drag = (d3: any) => {
        function dragstarted(event: any, d: any) {
            if (!event.active) engine.simulation.alphaTarget(0.3).restart();
            if (selectedNodeIds.has(d.id)) {
                selectedNodeIds.forEach(id => {
                    const node = nodeMap.get(id) as any;
                    if (node) {
                        node.fx = node.x; node.fy = node.y;
                        node.startX = node.x; node.startY = node.y;
                    }
                });
                d.startX = d.x; d.startY = d.y;
            } else {
                d.fx = d.x; d.fy = d.y;
            }
        }
        function dragged(event: any, d: any) {
            if (selectedNodeIds.has(d.id)) {
                const snappedX = Math.round(event.x / 25) * 25;
                const snappedY = Math.round(event.y / 25) * 25;
                const deltaX = snappedX - d.startX;
                const deltaY = snappedY - d.startY;
                selectedNodeIds.forEach(id => {
                    const node = nodeMap.get(id) as any;
                    if (node && node.startX !== undefined && node.startY !== undefined) {
                        node.fx = node.startX + deltaX;
                        node.fy = node.startY + deltaY;
                    }
                });
            } else {
                d.fx = Math.round(event.x / 25) * 25;
                d.fy = Math.round(event.y / 25) * 25;
            }
        }
        function dragended(event: any, d: any) {
            if (!event.active) engine.simulation.alphaTarget(0);
            engine.savePositions();
        }
        return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
    };

    const onNodeClick = (_: any, node: VisualNode) => {
        const nodeMapObj = new Map(activeNodes.map(n => [n.id, n]));
        const pathIds = resolveAncestryPath(node.id, nodeMapObj);
        selectedNodeIds = new Set([node.id]);
        renderer.focus(node.id, pathIds);
        inspector.render(node);
        document.getElementById('sidebar')?.classList.remove('hidden');
    };

    const resolveAncestryPath = (targetId: string, map: Map<string, VisualNode>): Set<string> => {
        const pathIds = new Set<string>();
        let currentId: string | undefined = targetId;
        while (currentId) {
            pathIds.add(currentId);
            const node = map.get(currentId);
            currentId = node?.parentId;
            if (currentId && pathIds.has(currentId)) break;
        }
        return pathIds;
    };

    const handleRoute = () => {
        const hash = window.location.hash.replace('#', '') || 'architecture';
        currentMode = hash === 'plan' ? 'plan' : 'architecture';
        handleRefresh();
    };

    window.addEventListener('popstate', handleRoute);
    handleRoute();

    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (e) => { 
        const payload = JSON.parse(e.data);
        if (payload.type === 'scan-complete' || payload.type === 'intent-updated') handleRefresh(true); 
        if (payload.type === 'lock-state-changed') handleRefresh(true);
    };
}
bootstrap();
