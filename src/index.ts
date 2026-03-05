import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import chokidar from 'chokidar';
import { AtlasEngine } from './Core/Application/AtlasEngine';
import { FileScanner } from './Core/Infrastructure/FileSystem/FileScanner';
import { GraphBuilder } from './Core/Infrastructure/Graph/GraphBuilder';
import { PolarLayoutStrategy } from './Core/Infrastructure/Layout/PolarLayoutStrategy';
import { IAtlasConfig } from './Shared/Config';
import { PipelineManager } from './pipeline';

async function main() {
    const cwd = process.cwd();
    const app = express();

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

    // Prune dead sessions and kill existing ghost for THIS project
    for (const key in sessions) {
        try {
            // Check if PID exists
            process.kill(sessions[key].pid, 0); 
            
            // If the process exists AND belongs to the same project, kill it!
            if (sessions[key].project === config.project || key === config.project) {
                console.log(`[Atlas] Killing existing ghost instance for project: ${config.project} (PID: ${sessions[key].pid}, Port: ${sessions[key].port})`);
                process.kill(sessions[key].pid); // Send SIGTERM
                delete sessions[key];
            }
        } catch (e) {
            // Process doesn't exist
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
    // --- END REGISTRY LOGIC ---

    // Composition Root
    const scanner = new FileScanner();
    const graphBuilder = new GraphBuilder();
    const layoutStrategy = new PolarLayoutStrategy();
    const engine = new AtlasEngine(scanner, graphBuilder, layoutStrategy);

    // --- MIDDLEWARE & LOGGING ---
    app.use(express.json());
    app.use((req, res, next) => {
        console.log(`[Express] ${req.method} ${req.url}`);
        next();
    });

    // --- API ROUTES ---
    app.post('/api/topology/positions', async (req, res) => {
        try {
            const updates: Record<string, { x: number, y: number }> = req.body;
            const dataDir = path.join(projectRoot, '.atlas/data');
            await fs.ensureDir(dataDir);
            
            // 1. Save to planned.json if applicable (for backward compatibility)
            const plannedPath = path.join(dataDir, 'planned.json');
            if (await fs.pathExists(plannedPath)) {
                const data = await fs.readJson(plannedPath);
                if (data.plannedNodes) {
                    for (const id in updates) {
                        const node = data.plannedNodes.find((n: any) => n.id === id);
                        if (node) {
                            node.x = updates[id].x;
                            node.y = updates[id].y;
                        }
                    }
                    await fs.outputJson(plannedPath, data, { spaces: 2 });
                }
            }
            
            // 2. Save to a global positions.json for all nodes
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
            
            // 3. Patch atlas.json so the viewer doesn't need a full rescan immediately
            const atlasPath = path.join(dataDir, 'atlas.json');
            if (await fs.pathExists(atlasPath)) {
                const atlasData = await fs.readJson(atlasPath);
                if (atlasData.nodes) {
                    for (const id in updates) {
                        if (atlasData.nodes[id]) {
                            atlasData.nodes[id].x = updates[id].x;
                            atlasData.nodes[id].y = updates[id].y;
                            atlasData.nodes[id].initialX = updates[id].x;
                            atlasData.nodes[id].initialY = updates[id].y;
                        }
                    }
                    await fs.outputJson(atlasPath, atlasData, { spaces: 2 });
                }
            }

            res.json({ success: true });
        } catch (e: any) {
            console.error(`[API Error] ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    let isScanning = false;
    const scanAndResolve = async () => {
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
            
            await fs.outputJson(path.join(dataDir, 'atlas.json'), registry, { spaces: 2 });
            console.log(`[Atlas] Scan complete and atlas.json updated.`);
            
            // Sync pipeline tasks with the new topology state
            await PipelineManager.sync();
            
            return registry;
        } finally {
            isScanning = false;
        }
    };

    // The engine and viewer are served from the central repository
    // while the data is read/written to the local project's .atlas/data directory.
    const engineRoot = path.resolve(__dirname, '..');
    const viewerDist = path.join(engineRoot, 'viewer/dist');
    
    // The data file is in the target project
    const dataFile = path.join(projectRoot, '.atlas/data/atlas.json');

    // CSP and Basic Headers
    app.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
        next();
    });

    app.get('/', (req, res) => {
        console.log(`[Atlas] Root hit! Redirecting to /viewer/...`);
        res.redirect('/viewer/');
    });
    app.use('/viewer', express.static(viewerDist, { dotfiles: 'allow' }));
    app.get('/data/atlas.json', (req, res) => res.sendFile(dataFile, { dotfiles: 'allow' }));
    app.get(/\/viewer.*/, (req, res) => res.sendFile(path.join(viewerDist, 'index.html'), { dotfiles: 'allow' }));

    await scanAndResolve();
    
    if (process.argv.includes('--scan-only')) {
        process.exit(0);
    }

    if (process.argv.includes('slice')) {
        const sliceIndex = process.argv.indexOf('slice');
        const targetId = process.argv[sliceIndex + 1];
        const depth = parseInt(process.argv[sliceIndex + 2] || '1', 10);

        if (!targetId) {
            console.error("Usage: atlas slice <nodeId> [depth]");
            process.exit(1);
        }

        if (await fs.pathExists(dataFile)) {
            const registry = await fs.readJson(dataFile);
            const sliced = AtlasEngine.slice(registry, targetId, depth);
            console.log(JSON.stringify(sliced, null, 2));
            process.exit(0);
        } else {
            console.error("atlas.json not found. Run a scan first.");
            process.exit(1);
        }
    }

    // Watcher for automatic updates
    const watchPaths = [
        path.join(projectRoot, 'docs/pipeline'),
        path.join(projectRoot, 'docs/topology'),
        ...config.scanPatterns.map(p => path.join(projectRoot, p.replace('**/*', '')))
    ];

    chokidar.watch(watchPaths, { ignoreInitial: true }).on('all', (event, path) => {
        console.log(`[Watcher] ${event} detected at ${path}`);
        scanAndResolve();
    });

    app.post('/api/topology/probe', async (req, res) => {
        try {
            const { nodeId } = req.body;
            console.log(`[Atlas] Manual Probe Triggered for: ${nodeId}`);
            
            const registry = await scanAndResolve();
            
            if (!registry) {
                res.status(503).json({ error: "Scan in progress, try again later." });
                return;
            }

            // Return everything, but also flag the specific neighborhood for the frontend
            res.json({
                registry,
                targetId: nodeId,
                dependencies: nodeId ? registry.nodes[nodeId]?.dependencies || [] : []
            });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    app.listen(port, () => {
        console.log(`\n================================================================`);
        console.log(`Atlas v8.0 [${config.project}]`);
        console.log(`URL:  http://localhost:${port}/viewer/`);
        console.log(`PID:  ${process.pid}`);
        console.log(`Registry: ${registryPath}`);
        console.log(`================================================================\n`);
    });
}
main();
