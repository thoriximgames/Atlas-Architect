import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import chokidar from 'chokidar';
import { exec } from 'child_process';
import { AtlasEngine } from './Core/Application/AtlasEngine';
import { FileScanner } from './Core/Infrastructure/FileSystem/FileScanner';
import { GraphBuilder } from './Core/Infrastructure/Graph/GraphBuilder';
import { PolarLayoutStrategy } from './Core/Infrastructure/Layout/PolarLayoutStrategy';
import { IAtlasConfig } from './Shared/Config';
import { PipelineManager } from './pipeline';
import { TopologyPlanner } from './blueprint';
import { Broadcaster } from './Core/Application/Broadcaster';

/**
 * Atlas Architect Root: The primary entry point and Composition Root for the backend engine.
 * 
 * DESIGN INTENT:
 * This module orchestrates the entire lifecycle of the Atlas service. It is responsible for:
 * 1.  System Bootstrapping: Initializing configuration, session management, and the shared registry.
 * 2.  Composition Root: Assembling the core engine (FileScanner, GraphBuilder, LayoutStrategy).
 * 3.  API Gateway: Serving the REST API for topology data, node management, and visualizer assets.
 * 4.  Codebase Watcher: Monitoring the target project for source changes to trigger automated rescans.
 * 5.  Broadcast Hub: Managing real-time Server-Sent Events (SSE) to keep connected clients synchronized.
 * 
 * All topological data flows through this root before being persisted to .atlas/data.
 */
async function main() {
    const cwd = process.cwd();
    const app = express();
    const broadcaster = new Broadcaster();

    const isScanOnly = process.argv.includes('--scan-only');
    const isSlice = process.argv.includes('slice');
    const isCLI = isScanOnly || isSlice;

    // Context Detection
    let projectRoot = cwd;
    
    // Parse explicit target flag if provided
    const targetIndex = process.argv.indexOf('--target');
    if (targetIndex !== -1 && process.argv.length > targetIndex + 1) {
        projectRoot = path.resolve(process.argv[targetIndex + 1]);
    } else if (path.basename(cwd) === '.atlas') {
        // If running from inside .atlas without flag, go up
        projectRoot = path.resolve(cwd, '..');
    }

    let configPath = path.join(projectRoot, 'atlas.config.json');

    // Load Config
    let config: IAtlasConfig;
    if (await fs.pathExists(configPath)) {
        config = await fs.readJson(configPath);
    } else {
        // Fallback: Check if config is in .atlas folder
        const internalConfig = path.join(projectRoot, '.atlas', 'atlas.config.json');
        if (await fs.pathExists(internalConfig)) {
             config = await fs.readJson(internalConfig);
        } else {
             console.error(`atlas.config.json not found in ${projectRoot} or .atlas/`);
             process.exit(1);
        }
    }

    // Default missing fields for robustness
    config.scanPatterns = config.scanPatterns || ["src/**/*.ts", "src/**/*.js", "src/**/*.tsx", "src/**/*.jsx"];
    config.entryPoints = config.entryPoints || [];
    config.exclude = config.exclude || [];

    // --- AUTO-PORT DISCOVERY & SESSION REGISTRY ---
    const homedir = process.env.USERPROFILE || process.env.HOME || "";
    const registryDir = path.join(homedir, '.gemini');
    const registryPath = path.join(registryDir, 'atlas_sessions.json');
    
    await fs.ensureDir(registryDir);
    
    let port = process.env.ATLAS_PORT ? parseInt(process.env.ATLAS_PORT, 10) : (config.port || 5055);
    const sessions: Record<string, { port: number, pid: number, project: string, path?: string }> = (await fs.pathExists(registryPath)) 
        ? await fs.readJson(registryPath) 
        : {};

    // Only kill existing session if we are actually intending to start a new server
    if (!isCLI) {
        for (const key in sessions) {
            try {
                process.kill(sessions[key].pid, 0); 
                if (sessions[key].project === config.project || key === config.project) {
                    console.log(`[Atlas] Killing existing ghost instance for project: ${config.project} (PID: ${sessions[key].pid}, Port: ${sessions[key].port})`);
                    process.kill(sessions[key].pid); // Send SIGTERM
                    delete sessions[key];
                }
            } catch (e) {
                delete sessions[key];
            }
        }

        // Find free port
        const takenPorts = new Set(Object.values(sessions).map(s => s.port));
        while (takenPorts.has(port)) {
            port++;
        }

        // Register this session
        sessions[config.project] = {
            port: port,
            pid: process.pid,
            project: config.project,
            path: projectRoot
        };
        await fs.outputJson(registryPath, sessions, { spaces: 2 });
    }
    // --- END REGISTRY LOGIC ---

    // Composition Root
    const scanner = new FileScanner();
    const graphBuilder = new GraphBuilder();
    const layoutStrategy = new PolarLayoutStrategy();
    const engine = new AtlasEngine(scanner, graphBuilder, layoutStrategy);

    // --- MIDDLEWARE & LOGGING ---
    app.use(express.json());
    app.use((req, res, next) => {
        if (!req.url.includes('/api/events')) {
            console.log(`[Express] ${req.method} ${req.url}`);
        }
        next();
    });

    // --- SSE EVENTS ---
    app.get('/api/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        broadcaster.addClient(res);
    });

    // --- API ROUTES ---
    app.post('/api/topology/positions', async (req, res) => {
        try {
            const updates: Record<string, { x: number, y: number }> = req.body;
            
            // 1. Save to planned.json (The Blueprint) using TopologyPlanner for consistency
            const plannedData = await TopologyPlanner.loadBlueprint();
            let modified = false;
            for (const id in updates) {
                const node = plannedData.plannedNodes.find((n: any) => n.id === id);
                if (node) {
                    node.x = updates[id].x;
                    node.y = updates[id].y;
                    modified = true;
                }
            }
            if (modified) {
                await TopologyPlanner.saveBlueprint(plannedData);
                console.log(`[Atlas] Updated ${Object.keys(updates).length} node positions in planned.json`);
            }
            
            // 2. Save to a global positions.json for all nodes
            const dataDir = path.join(projectRoot, '.atlas/data');
            await fs.ensureDir(dataDir);
            const positionsPath = path.join(dataDir, 'positions.json');
            let positions: Record<string, { x: number, y: number }> = {};
            if (await fs.pathExists(positionsPath)) {
                positions = await fs.readJson(positionsPath);
            }
            for (const id in updates) {
                positions[id] = updates[id];
            }
            await fs.outputJson(positionsPath, positions, { spaces: 2 });
            console.log(`[Atlas] Saved ${Object.keys(updates).length} node positions to positions.json`);
            
            // 3. Patch reality.json so the viewer doesn't need a full rescan immediately
            const realityPath = path.join(dataDir, 'reality.json');
            if (await fs.pathExists(realityPath)) {
                const realityData = await fs.readJson(realityPath);
                if (realityData.nodes) {
                    for (const id in updates) {
                        if (realityData.nodes[id]) {
                            realityData.nodes[id].x = updates[id].x;
                            realityData.nodes[id].y = updates[id].y;
                            realityData.nodes[id].initialX = updates[id].x;
                            realityData.nodes[id].initialY = updates[id].y;
                        }
                    }
                    await fs.outputJson(realityPath, realityData, { spaces: 2 });
                }
            }

            res.json({ success: true });
        } catch (e: any) {
            console.error(`[API Error] ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    let isScanning = false;
    const scanAndResolve = async (shouldBroadcast: boolean = true) => {
        if (isScanning) return;
        isScanning = true;
        try {
            console.log(`[Atlas] Rescanning...`);
            const registry = await engine.run(projectRoot, config);
            
            // Ensure data directory exists
            const dataDir = path.join(projectRoot, '.atlas/data');
            await fs.ensureDir(dataDir);
            
            // Inject positions from positions.json into the scanned registry
            const positionsPath = path.join(dataDir, 'positions.json');
            if (await fs.pathExists(positionsPath)) {
                const positions = await fs.readJson(positionsPath);
                for (const id in registry.nodes) {
                    if (positions[id]) {
                        registry.nodes[id].x = positions[id].x;
                        registry.nodes[id].y = positions[id].y;
                        registry.nodes[id].initialX = positions[id].x;
                        registry.nodes[id].initialY = positions[id].y;
                    }
                }
            }
            
            await fs.outputJson(path.join(dataDir, 'reality.json'), registry, { spaces: 2 });
            console.log(`[Atlas] Scan complete and reality.json updated.`);
            
            // Notify UI clients
            if (shouldBroadcast) {
                broadcaster.broadcast('scan-complete');
            }

            // Sync pipeline tasks with the new topology state
            await PipelineManager.sync();
            
            return registry;
        } finally {
            isScanning = false;
        }
    };

    // The engine and viewer are served from the central repository
    const engineRoot = path.resolve(__dirname, '..');
    const viewerDist = path.join(engineRoot, 'viewer/dist');
    const realityFile = path.join(projectRoot, '.atlas/data/reality.json');

    // CSP and Basic Headers
    app.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
        next();
    });

    app.get('/', (req, res) => {
        res.redirect('/viewer/');
    });
    app.use('/viewer', express.static(viewerDist, { dotfiles: 'allow' }));
    app.get('/data/reality.json', (req, res) => res.sendFile(realityFile, { dotfiles: 'allow' }));
    
    // Compatibility route for legacy fetch
    app.get('/data/planned.json', async (req, res) => {
        const data = await TopologyPlanner.loadBlueprint(false);
        res.json(data);
    });

    app.get('/api/topology/state', async (req, res) => {
        const isLocked = await TopologyPlanner.isLocked();
        res.json({ planningActive: isLocked, locked: isLocked });
    });

    app.get('/api/blueprint', async (req, res) => {
        const isPlanMode = req.query.mode === 'plan';
        const data = await TopologyPlanner.loadBlueprint(isPlanMode);
        res.json(data);
    });

    app.post('/api/plan/merge', async (req, res) => {
        await TopologyPlanner.promote();
        res.json({ success: true });
    });

    app.get('/api/config/node-types', async (req, res) => {
        const typesPath = path.join(projectRoot, '.atlas', 'data', 'node_types.json');
        if (await fs.pathExists(typesPath)) {
            const types = await fs.readJson(typesPath);
            res.json(types);
        } else {
            res.status(404).json({ error: 'Node types config not found' });
        }
    });

    app.get(/\/viewer.*/, (req, res) => res.sendFile(path.join(viewerDist, 'index.html'), { dotfiles: 'allow' }));

    await scanAndResolve();
    
    if (process.argv.includes('--scan-only')) {
        process.exit(0);
    }

    if (process.argv.includes('slice')) {
        const sliceIndex = process.argv.indexOf('slice');
        const targetId = process.argv[sliceIndex + 1];
        const depth = parseInt(process.argv[sliceIndex + 2] || '1', 10);

        if (await fs.pathExists(realityFile)) {
            const registry = await fs.readJson(realityFile);
            const sliced = AtlasEngine.slice(registry, targetId, depth);
            console.log(JSON.stringify(sliced, null, 2));
            process.exit(0);
        } else {
            console.error("reality.json not found. Run a scan first.");
            process.exit(1);
        }
    }

    // Watcher for automatic updates
    const watchPaths = [
        ...config.scanPatterns.map((p: string) => path.join(projectRoot, p.replace('**/*', ''))),
        path.join(projectRoot, '.atlas/data/plan.json')
    ];

    chokidar.watch(watchPaths, { ignoreInitial: true }).on('all', (event, p) => {
        if (p.endsWith('plan.json')) {
            if (event === 'add' || event === 'unlink') {
                console.log(`[Atlas] Plan state changed (${event}). Broadcasting lock update.`);
                broadcaster.broadcast('lock-state-changed');
            }
            return;
        }
        
        if (p.endsWith('.json') || p.endsWith('.md')) return; 
        scanAndResolve();
    });

    app.post('/api/topology/probe', async (req, res) => {
        try {
            const { nodeId } = req.body;
            const registry = await scanAndResolve(false);
            if (!registry) { res.status(503).json({ error: "Scan in progress" }); return; }
            const outgoingEdges = registry.edges.filter((e: any) => e.source === nodeId || e.source.id === nodeId);
            const depIds = Array.from(new Set(outgoingEdges.map((e: any) => e.target.id || e.target)));
            res.json({ registry, targetId: nodeId, dependencies: depIds });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/topology/blueprint/discover', async (req, res) => {
        try {
            const { nodeId, nodesToAdd } = req.body;
            const registry = await scanAndResolve(false);
            if (!registry) { res.status(503).json({ error: "Scan in progress" }); return; }

            const plannedData = await TopologyPlanner.loadBlueprint();
            const existingIds = new Set((plannedData.plannedNodes || []).map((n: any) => n.id));

            const payload = nodesToAdd
                .filter((id: string) => !existingIds.has(id))
                .map((id: string) => {
                    const realityNode = registry.nodes[id];
                    return {
                        id,
                        name: realityNode?.name || id.split('/').pop() || id,
                        type: (realityNode?.type as any) || 'Unknown',
                        purpose: "", 
                        parentId: nodeId,
                        description: realityNode?.description || "" 
                    };
                }).filter((n: any) => !!n.id);

            if (payload.length > 0) {
                await TopologyPlanner.upsertNodes(payload);
            }
            
            const newPlannedData = await TopologyPlanner.loadBlueprint();
            res.json({ success: true, plannedData: newPlannedData });
        } catch (e: any) {
            console.error(`[API Error] ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/topology/sync', async (req, res) => {
        try {
            const registry = await scanAndResolve(false);
            if (!registry) { res.status(503).json({ error: "Scan in progress" }); return; }
            const healedPlannedData = await TopologyPlanner.heal(registry.nodes);
            res.json({ success: true, realityData: registry, plannedData: healedPlannedData });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    app.listen(port, () => {
        const url = `http://localhost:${port}/viewer/`;
        console.log(`\n================================================================`);
        console.log(`Atlas v8.0 [${config.project}]`);
        console.log(`URL:  ${url}`);
        console.log(`PID:  ${process.pid}`);
        console.log(`================================================================\n`);
        if (!isCLI) {
            const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
            exec(`${start} ${url}`);
        }
    });
}
main();
