import * as d3 from 'd3';
import { GalaxyEngine } from './Engine/GalaxyEngine';
import { StageRenderer } from './Renderer/StageRenderer';
import { Inspector } from './UI/Inspector';
import { Legend } from './UI/Legend';
import { VisualNode, VisualLink } from './Protocol/VisualTypes';
import './style.css';

async function bootstrap() {
    const res = await fetch('/data/atlas.json');
    const data = await res.json();

    if (data.project) {
        document.title = `Atlas | ${data.project}`;
    }

    const nodes = Object.values(data.nodes) as VisualNode[];
    const nodeMap = new Map<string, VisualNode>();
    nodes.forEach(n => nodeMap.set(n.id, n));

    nodes.forEach((n) => {
        // Rule: If engine provided initialX/Y from planned.json, it's already the offset.
        // If not, it defaults to a polar projection.
        n.x = n.initialX || 0;
        n.y = n.initialY || 0;
        
        // If the backend actually returned non-zero initial coordinates (manual placement),
        // we lock it immediately so physics doesn't touch it.
        if (n.initialX !== 0 || n.initialY !== 0) {
            n.fx = n.x;
            n.fy = n.y;
        }

        n.radius = 12 + Math.sqrt(n.descendantCount || 0) * 6;
        if (n.depth === 0 && n.fx === undefined) { n.fx = n.x; n.fy = n.y; }
    });

    const inspector = new Inspector();
    const legend = new Legend();
    legend.render();

    let selectedGroup = new Set<string>();

    const renderer = new StageRenderer(() => { 
        renderer.reset(); 
        inspector.clear(); 
        document.getElementById('sidebar')?.classList.add('hidden');
        selectedGroup.clear();
    });
    
    renderer.onGroupSelect((ids) => {
        selectedGroup = ids;
    });

    const engine = new GalaxyEngine(
        nodes, 
        data.edges, 
        () => renderer.ticking(),
        () => {
            renderer.draw(engine.state.nodes, engine.state.links, engine.state.weightMap, onNodeClick);
            renderer.enableDrag(drag(d3));
        }
    );

    // --- Drag and Drop Logic ---
    const drag = (d3: any) => {
        function dragstarted(event: any, d: any) {
            console.log(`[Drag] Start: ${d.id}`);
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
                    item.node.fx = event.x + item.offsetX;
                    item.node.fy = event.y + item.offsetY;
                });
            } else {
                d.fx = event.x;
                d.fy = event.y;
            }
        }

        function dragended(event: any, d: any) {
            console.log(`[Drag] End: ${d.id}. Saving positions...`);
            if (!event.active) engine.simulation.alphaTarget(0);
            
            // Optionally clear selection after drag? No, keep it so they can drag again.
            engine.savePositions();
        }

        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    };

    const onNodeClick = (node: VisualNode) => {
        // If they click a node without dragging, select just it (and focus path)
        if (!selectedGroup.has(node.id)) {
            selectedGroup.clear();
            selectedGroup.add(node.id);
            renderer.highlightGroup(selectedGroup);
        }

        const path = new Set<string>([node.id]);
        let curr: any = node;
        while(curr?.parentId) { path.add(curr.parentId); curr = nodeMap.get(curr.parentId); }
        if (node.dependencies) node.dependencies.forEach(depId => path.add(depId));

        renderer.focus(node.id, path);
        inspector.render(node);
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
        
        const filteredNodes = page === 'architecture' ? nodes.filter(n => n.status !== 'orphan') : nodes.filter(n => n.status === 'orphan');
        const ids = new Set(filteredNodes.map(n => n.id));
        const filteredLinks = (data.edges as VisualLink[]).filter(l => {
            const s = (l.source as any).id || l.source;
            const t = (l.target as any).id || l.target;
            return ids.has(s) && ids.has(t);
        });

        if (useIntro && page === 'architecture') engine.bootstrap(); 
        else engine.resetData(filteredNodes, filteredLinks);
        
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
