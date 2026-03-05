import * as d3 from 'd3';
import { GalaxyEngine } from './Engine/GalaxyEngine';
import { StageRenderer } from './Renderer/StageRenderer';
import { Inspector } from './UI/Inspector';
import { Legend } from './UI/Legend';
import { VisualNode, VisualLink } from './Protocol/VisualTypes';
import './style.css';

async function bootstrap() {
    const [realityRes, plannedRes] = await Promise.all([
        fetch('/data/reality.json'),
        fetch('/data/planned.json')
    ]);
    
    const realityData = await realityRes.json();
    const plannedData = await plannedRes.json();

    if (realityData.project) {
        document.title = `Atlas | ${realityData.project}`;
        const projectLabel = document.getElementById('project-label');
        if (projectLabel) {
            projectLabel.innerText = `ATLAS | ${realityData.project.toUpperCase()}`;
        }
    }

    const realityNodes = Object.values(realityData.nodes || {}) as VisualNode[];
    const realityEdges = realityData.edges || [];
    
    const plannedNodesRaw = Array.isArray(plannedData) ? plannedData : (plannedData.plannedNodes || []);
    
    // Map reality for quick lookup
    const realityMap = new Map<string, VisualNode>();
    realityNodes.forEach(n => realityMap.set(n.id, n));

    // Construct Blueprint Nodes
    const blueprintNodes: VisualNode[] = plannedNodesRaw.map((pn: any) => {
        const isReal = realityMap.has(pn.id);
        const realNode = realityMap.get(pn.id);
        
        // Use planned position if available, else default to 0
        const x = pn.x !== undefined ? pn.x : (realNode?.x || 0);
        const y = pn.y !== undefined ? pn.y : (realNode?.y || 0);
        
        const depth = pn.parentId ? 2 : 1; // Simplistic depth for now

        return {
            id: pn.id,
            name: pn.name,
            type: pn.type || (realNode ? realNode.type : 'Unknown'),
            status: isReal ? 'verified' : 'planned',
            parentId: pn.parentId,
            dependencies: pn.dependencies || [],
            descendantCount: 0,
            depth: depth,
            x: x,
            y: y,
            initialX: x,
            initialY: y,
            radius: 20,
            fx: (x !== 0 || y !== 0) ? x : undefined,
            fy: (x !== 0 || y !== 0) ? y : undefined
        } as VisualNode;
    });

    // Calculate blueprint edges
    const blueprintEdges: any[] = [];
    blueprintNodes.forEach(n => {
        if (n.parentId) {
            blueprintEdges.push({ source: n.parentId, target: n.id, isGravity: true, type: 'inheritance' });
        }
        if (n.dependencies) {
            n.dependencies.forEach(dep => {
                blueprintEdges.push({ source: n.id, target: dep, isGravity: false, type: 'dependency' });
            });
        }
    });

    // Construct Orphan Nodes (Reality minus Blueprint)
    const plannedSet = new Set(blueprintNodes.map(n => n.id));
    const orphanNodes = realityNodes.filter(n => !plannedSet.has(n.id)).map(n => {
        n.status = 'orphan';
        n.radius = 20 + Math.sqrt(n.descendantCount || 0) * 6;
        if (n.initialX !== 0 || n.initialY !== 0) {
            n.fx = n.x;
            n.fy = n.y;
        }
        return n;
    });
    
    const orphanEdges = realityEdges.filter((e: any) => {
        const s = e.source.id || e.source;
        const t = e.target.id || e.target;
        return !plannedSet.has(s) && !plannedSet.has(t);
    });

    const nodeMap = new Map<string, VisualNode>();
    [...blueprintNodes, ...orphanNodes].forEach(n => nodeMap.set(n.id, n));

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

    const renderer = new StageRenderer(() => { 
        renderer.reset(); 
        inspector.clear(); 
        document.getElementById('sidebar')?.classList.add('hidden');
        document.getElementById('node-toolbox')?.classList.add('hidden');
        selectedGroup.clear();
    });

    // --- Toolbox Button Listeners ---
    const probeNode = async () => {
        const targetId = renderer.selectedId;
        if (!targetId) return;

        console.log(`[Discovery] Probing neighborhood for: ${targetId}`);
        
        const res = await fetch('/api/topology/probe', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId: targetId })
        });
        
        if (!res.ok) return;
        
        const data = await res.json();
        const updatedRegistry = data.registry;
        const updatedNodes = Object.values(updatedRegistry.nodes) as VisualNode[];
        
        // 1. Reveal dependencies found in the probe
        if (data.dependencies) {
            data.dependencies.forEach((depId: string) => {
                revealedIds.add(depId);
            });
        }

        // 2. Update master node list and map
        updatedNodes.forEach(un => {
            const existing = nodeMap.get(un.id);
            if (existing) {
                un.x = existing.x; un.y = existing.y;
                un.fx = existing.fx; un.fy = existing.fy;
            } else {
                un.x = 0; un.y = 0;
            }
            un.radius = 12 + Math.sqrt(un.descendantCount || 0) * 6;
            nodeMap.set(un.id, un);
        });

        // 3. Update view with ONLY the revealed set
        updateDisplay(updatedNodes, updatedRegistry.edges);
        
        const freshNode = updatedNodes.find(n => n.id === targetId);
        if (freshNode) inspector.render(freshNode);
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
