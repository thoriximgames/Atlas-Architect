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

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    nodes.forEach((n) => {
        n.x = centerX + n.initialX;
        n.y = centerY + n.initialY;
        n.radius = 12 + Math.sqrt(n.descendantCount || 0) * 6;
        if (n.depth === 0) { n.fx = n.x; n.fy = n.y; }
    });

    const inspector = new Inspector();
    const legend = new Legend();
    legend.render();

    const renderer = new StageRenderer(() => { 
        renderer.reset(); 
        inspector.clear(); 
        document.getElementById('sidebar')?.classList.add('hidden');
    });
    const engine = new GalaxyEngine(
        nodes, 
        data.edges, 
        () => renderer.ticking(),
        () => renderer.draw(engine.state.nodes, engine.state.links, engine.state.weightMap, onNodeClick)
    );

    const onNodeClick = (node: VisualNode) => {
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
