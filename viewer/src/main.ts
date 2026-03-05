import * as d3 from 'd3';
import { GalaxyEngine } from './Engine/GalaxyEngine';
import { StageRenderer } from './Renderer/StageRenderer';
import { Inspector } from './UI/Inspector';
import { Legend } from './UI/Legend';
import { Toolbar } from './UI/Toolbar';
import { VisualNode, VisualLink } from './Protocol/VisualTypes';
import './style.css';

async function bootstrap() {
    const [realityRes, plannedRes] = await Promise.all([
        fetch('/data/reality.json'),
        fetch('/data/planned.json')
    ]);
    
    let realityData = await realityRes.json();
    let plannedData = await plannedRes.json();

    if (realityData.project) {
        document.title = `Atlas | ${realityData.project}`;
        const projectLabel = document.getElementById('project-label');
        if (projectLabel) {
            projectLabel.innerText = `ATLAS | ${realityData.project.toUpperCase()}`;
        }
    }

    const nodeMap = new Map<string, VisualNode>();
    let blueprintNodes: VisualNode[] = [];
    let blueprintEdges: any[] = [];
    let orphanNodes: VisualNode[] = [];
    let orphanEdges: any[] = [];

    const rebuildGraphData = (pData: any, rData: any) => {
        const rNodes = Object.values(rData.nodes || {}) as VisualNode[];
        const rEdges = rData.edges || [];
        const pNodesRaw = Array.isArray(pData) ? pData : (pData.plannedNodes || []);
        
        const rMap = new Map<string, VisualNode>();
        rNodes.forEach(n => rMap.set(n.id, n));

        blueprintNodes = pNodesRaw.map((pn: any) => {
            const isReal = rMap.has(pn.id);
            const realNode = rMap.get(pn.id);
            
            // For blueprint, we ONLY care about positions explicitly saved in planned.json.
            // If they are newly discovered, let them spawn at 0,0 and let physics expand them.
            // Do NOT inherit the static layout positions from the reality scan.
            const hasPlannedPosition = pn.x !== undefined && pn.y !== undefined;
            const x = hasPlannedPosition ? pn.x : 0;
            const y = hasPlannedPosition ? pn.y : 0;
            
            return {
                id: pn.id,
                name: pn.name,
                type: pn.type || (realNode ? realNode.type : 'Unknown'),
                status: isReal ? 'verified' : 'planned',
                parentId: pn.parentId,
                dependencies: pn.dependencies || [],
                descendantCount: realNode?.descendantCount || 0,
                complexity: realNode?.complexity || 0,
                methods: realNode?.methods || [],
                fields: realNode?.fields || [],
                events: realNode?.events || [],
                file: realNode?.file || pn.id,
                baseClasses: realNode?.baseClasses || [],
                purpose: pn.purpose || realNode?.purpose || "",
                description: pn.description || realNode?.description || "",
                depth: pn.parentId ? 2 : 1,
                x: x, y: y, initialX: x, initialY: y, 
                radius: 20 + Math.sqrt(realNode?.descendantCount || 0) * 6,
                fx: hasPlannedPosition ? x : undefined,
                fy: hasPlannedPosition ? y : undefined
            } as VisualNode;
        });

        blueprintEdges = [];
        blueprintNodes.forEach(n => {
            if (n.parentId) blueprintEdges.push({ source: n.parentId, target: n.id, isGravity: true, type: 'inheritance' });
            if (n.dependencies) n.dependencies.forEach(dep => blueprintEdges.push({ source: n.id, target: dep, isGravity: false, type: 'dependency' }));
        });

        const pSet = new Set(blueprintNodes.map(n => n.id));
        orphanNodes = rNodes.filter(n => !pSet.has(n.id)).map(n => {
            n.status = 'orphan';
            n.radius = 20 + Math.sqrt(n.descendantCount || 0) * 6;
            if (n.initialX !== 0 || n.initialY !== 0) { n.fx = n.x; n.fy = n.y; }
            return n;
        });
        
        orphanEdges = rEdges.filter((e: any) => {
            const s = e.source.id || e.source;
            const t = e.target.id || e.target;
            return !pSet.has(s) && !pSet.has(t);
        });

        nodeMap.clear();
        [...blueprintNodes, ...orphanNodes].forEach(n => nodeMap.set(n.id, n));
    };

    rebuildGraphData(plannedData, realityData);

    const inspector = new Inspector();
    const legend = new Legend();
    legend.render();

    let selectedGroup = new Set<string>();
    let revealedIds = new Set<string>();

    blueprintNodes.forEach(n => {
        if (n.status === 'verified') revealedIds.add(n.id);
    });

    const updateDisplay = (allNodes: VisualNode[], allEdges: any[]) => {
        const filteredNodes = allNodes.filter(n => revealedIds.has(n.id) || n.status === 'orphan'); // simplify for now
        const activeIds = new Set(filteredNodes.map(n => n.id));
        const filteredEdges = allEdges.filter(l => {
            const s = (l.source as any).id || l.source;
            const t = (l.target as any).id || l.target;
            return activeIds.has(s) && activeIds.has(t);
        });
        engine.resetData(filteredNodes, filteredEdges);
    };

    const handleSync = async () => {
        try {
            const res = await fetch('/api/topology/sync', { method: 'POST' });
            if (!res.ok) throw new Error('Sync failed');
            const data = await res.json();
            
            realityData = data.realityData;
            plannedData = data.plannedData;
            
            rebuildGraphData(plannedData, realityData);
            
            const hash = window.location.hash.replace('#', '');
            const isBlueprint = hash !== 'orphans';
            const currentNodes = isBlueprint ? blueprintNodes : orphanNodes;
            const currentEdges = isBlueprint ? blueprintEdges : orphanEdges;
            
            engine.resetData(currentNodes, currentEdges);
            
            if (renderer.selectedId) {
                 const targetNode = orphanNodes.find(n => n.id === renderer.selectedId) || blueprintNodes.find(n => n.id === renderer.selectedId);
                 if (targetNode) inspector.render(targetNode);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const toolbar = new Toolbar(handleSync);

    const renderer = new StageRenderer(() => { 
        renderer.reset(); 
        inspector.clear(); 
        document.getElementById('sidebar')?.classList.add('hidden');
        document.getElementById('node-toolbox')?.classList.add('hidden');
        selectedGroup.clear();
    });

    const showFeedback = (el: HTMLElement, message: string, color: string = '#ef4444') => {
        const feedback = document.createElement('div');
        feedback.innerText = message;
        feedback.style.position = 'absolute';
        feedback.style.top = '-25px';
        feedback.style.left = '50%';
        feedback.style.transform = 'translateX(-50%)';
        feedback.style.color = color;
        feedback.style.fontSize = '10px';
        feedback.style.fontWeight = '800';
        feedback.style.whiteSpace = 'nowrap';
        feedback.style.pointerEvents = 'none';
        feedback.style.zIndex = '3000';
        feedback.style.animation = 'fadeOut 1.5s forwards';
        
        el.style.position = 'relative';
        el.appendChild(feedback);
        setTimeout(() => feedback.remove(), 1500);
    };

    // --- Toolbox Button Listeners ---
    const probeNode = async () => {
        const targetId = renderer.selectedId;
        const btn = document.getElementById('btn-probe');
        if (!targetId || !btn) return;

        console.log(`[Discovery] Probing neighborhood for: ${targetId}`);
        
        const res = await fetch('/api/topology/probe', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId: targetId })
        });
        
        if (!res.ok) return;
        
        const data = await res.json();
        
        if (data.dependencies && data.dependencies.length > 0) {
            console.log(`[Discovery] Found dependencies:`, data.dependencies);
            
            const hash = window.location.hash.replace('#', '');
            if (hash !== 'orphans') {
                // Check if all dependencies are already in blueprint
                const pSet = new Set(blueprintNodes.map(n => n.id));
                const newNodes = data.dependencies.filter((id: string) => !pSet.has(id));

                if (newNodes.length === 0) {
                    showFeedback(btn, 'NOTHING NEW TO DISCOVER');
                    return;
                }

                // We are in Blueprint view. Auto-add to Blueprint!
                console.log(`[Discovery] Auto-adding dependencies to Blueprint...`);
                const discRes = await fetch('/api/topology/blueprint/discover', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nodeId: targetId, nodesToAdd: data.dependencies })
                });
                
                if (discRes.ok) {
                    const discData = await discRes.json();
                    // Dynamically rebuild local state
                    rebuildGraphData(discData.plannedData, realityData);
                    
                    // Add new IDs to revealed set so they appear (legacy, but safe to keep)
                    data.dependencies.forEach((id: string) => revealedIds.add(id));
                    
                    // Update engine with ONLY blueprint nodes since we are on the blueprint tab
                    engine.resetData(blueprintNodes, blueprintEdges);
                    
                    // Highlight the new cluster and re-center without hiding everything else
                    const cluster = new Set<string>([targetId, ...data.dependencies]);
                    selectedGroup = cluster;
                    renderer.highlightGroup(selectedGroup);
                    renderer.centerView([...blueprintNodes].filter(n => cluster.has(n.id)));
                    showFeedback(btn, `ADDED ${newNodes.length} NODES`, '#14AE5C');
                }
            } else {
                // Switch to Scan view behavior (already implemented)
                const newSelection = new Set<string>();
                newSelection.add(targetId);
                data.dependencies.forEach((depId: string) => newSelection.add(depId));
                selectedGroup = newSelection;
                renderer.highlightGroup(selectedGroup);
                renderer.focus(targetId, newSelection);
                const targetNode = orphanNodes.find(n => n.id === targetId) || blueprintNodes.find(n => n.id === targetId);
                if (targetNode) inspector.render(targetNode);
            }
        } else {
             console.log(`[Discovery] No outgoing dependencies found in reality.`);
             showFeedback(btn, 'NO CONNECTIONS FOUND');
        }
    };

    document.getElementById('btn-probe')?.addEventListener('click', () => {
        probeNode();
    });

    document.getElementById('btn-audit')?.addEventListener('click', () => {
        if (renderer.selectedId) {
            console.log(`[Toolbox] Auditing source for: ${renderer.selectedId}`);
        }
    });
    
    renderer.onGroupSelect((ids) => {
        selectedGroup = ids;
    });

    const engine = new GalaxyEngine(
        [...blueprintNodes, ...orphanNodes], 
        [...blueprintEdges, ...orphanEdges], 
        () => renderer.ticking(),
        () => {
            renderer.draw(engine.state.nodes, engine.state.links, engine.state.weightMap, onNodeClick);
            renderer.enableDrag(drag(d3));
        }
    );

    const GRID_SIZE = 25;

    // --- Drag and Drop Logic ---
    const drag = (d3: any) => {
        function dragstarted(event: any, d: any) {
            if (!event.active) engine.simulation.alphaTarget(0.3).restart();
            
            // If the dragged node is not in the active selection, select only it
            if (!selectedGroup.has(d.id)) {
                selectedGroup.clear();
                selectedGroup.add(d.id);
                renderer.highlightGroup(selectedGroup);
            }

            d.dragNodes = [];
            selectedGroup.forEach(id => {
                const n = nodeMap.get(id);
                if (n) {
                    n.fx = n.x;
                    n.fy = n.y;
                    d.dragNodes.push({
                        node: n,
                        offsetX: n.x - d.x,
                        offsetY: n.y - d.y
                    });
                }
            });
        }

        function dragged(event: any, d: any) {
            if (d.dragNodes) {
                d.dragNodes.forEach((item: any) => {
                    const targetX = event.x + item.offsetX;
                    const targetY = event.y + item.offsetY;
                    
                    // Live snap to grid for feedback
                    item.node.fx = Math.round(targetX / GRID_SIZE) * GRID_SIZE;
                    item.node.fy = Math.round(targetY / GRID_SIZE) * GRID_SIZE;
                });
            } else {
                d.fx = Math.round(event.x / GRID_SIZE) * GRID_SIZE;
                d.fy = Math.round(event.y / GRID_SIZE) * GRID_SIZE;
            }
        }

        function dragended(event: any, d: any) {
            if (!event.active) engine.simulation.alphaTarget(0);
            
            // Final snap verification
            if (d.dragNodes) {
                d.dragNodes.forEach((item: any) => {
                    item.node.fx = Math.round(item.node.fx / GRID_SIZE) * GRID_SIZE;
                    item.node.fy = Math.round(item.node.fy / GRID_SIZE) * GRID_SIZE;
                });
            }

            // Optionally clear selection after drag? No, keep it so they can drag again.
            engine.savePositions();
        }

        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    };

    const onNodeClick = (event: MouseEvent, node: VisualNode) => {
        if (event.shiftKey) {
            // Add to selection
            selectedGroup.add(node.id);
        } else if (event.altKey) {
            // Remove from selection
            selectedGroup.delete(node.id);
        } else {
            // Standard single selection
            if (!selectedGroup.has(node.id)) {
                selectedGroup.clear();
                selectedGroup.add(node.id);
            }
        }
        
        renderer.highlightGroup(selectedGroup);

        const path = new Set<string>([node.id]);
        let curr: any = node;
        while(curr?.parentId) { path.add(curr.parentId); curr = nodeMap.get(curr.parentId); }
        if (node.dependencies) node.dependencies.forEach(depId => path.add(depId));

        renderer.focus(node.id, path);
        inspector.render(node);
        
        // Fix: Explicitly show the RIGHT sidebar
        document.getElementById('sidebar')?.classList.remove('hidden');
    };

    // --- Sidebar Toggle Logic ---
    const btnToggleLayers = document.getElementById('btn-toggle-layers');
    const btnSwitchNav = document.getElementById('btn-switch-nav');
    
    const sidebarLeft = document.getElementById('layer-sidebar');
    const navTitle = document.getElementById('nav-title');
    const contentLayers = document.getElementById('nav-content-layers');
    const contentInfo = document.getElementById('nav-content-info');

    btnToggleLayers?.addEventListener('click', () => {
        sidebarLeft?.classList.toggle('hidden');
    });

    let currentNavMode: 'layers' | 'info' = 'layers';
    btnSwitchNav?.addEventListener('click', () => {
        currentNavMode = currentNavMode === 'layers' ? 'info' : 'layers';
        
        if (currentNavMode === 'layers') {
            navTitle!.innerText = 'Registry Layers';
            contentLayers?.classList.remove('hidden');
            contentInfo?.classList.add('hidden');
        } else {
            navTitle!.innerText = 'Atlas Legend';
            contentLayers?.classList.add('hidden');
            contentInfo?.classList.remove('hidden');
            legend.render(); // Ensure legend is rendered when switching
        }
    });

    // --- Page Routing Logic ---
    const btnArchitecture = document.getElementById('btn-architecture');
    const btnOrphans = document.getElementById('btn-orphans');

    const switchPage = (page: 'architecture' | 'orphans', useIntro = false) => {
        engine.stopBootstrap();
        renderer.reset();
        inspector.clear();
        selectedGroup.clear();
        renderer.highlightGroup(selectedGroup);
        
        const filteredNodes = page === 'architecture' ? blueprintNodes : orphanNodes;
        const filteredLinks = page === 'architecture' ? blueprintEdges : orphanEdges;

        if (useIntro && page === 'architecture') engine.bootstrap(); 
        else engine.resetData(filteredNodes, filteredLinks);
        
        // Center camera on the filtered set of nodes
        renderer.centerView(filteredNodes);

        if (page === 'architecture') { btnArchitecture?.classList.add('active'); btnOrphans?.classList.remove('active'); }
        else { btnOrphans?.classList.add('active'); btnArchitecture?.classList.remove('active'); }

        if (window.location.hash !== `#${page}`) history.pushState(null, '', `#${page}`);
    };

    btnArchitecture?.addEventListener('click', () => switchPage('architecture', true));
    btnOrphans?.addEventListener('click', () => switchPage('orphans', false));

    const handleRoute = (isInitial = false) => {
        const hash = window.location.hash.replace('#', '');
        hash === 'orphans' ? switchPage('orphans', false) : switchPage('architecture', isInitial);
    };

    window.addEventListener('popstate', () => handleRoute(false));
    handleRoute(true);
}
bootstrap();
