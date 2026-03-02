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
    let configPath = path.join(cwd, 'atlas.config.json');

    // If running from inside .atlas, go up
    if (path.basename(cwd) === '.atlas') {
        projectRoot = path.resolve(cwd, '..');
        configPath = path.join(projectRoot, 'atlas.config.json');
    }

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

    // --- AUTO-PORT DISCOVERY & SESSION REGISTRY ---
    const homedir = process.env.USERPROFILE || process.env.HOME || "";
    const registryDir = path.join(homedir, '.gemini');
    const registryPath = path.join(registryDir, 'atlas_sessions.json');
    
    await fs.ensureDir(registryDir);
    
    let port = process.env.ATLAS_PORT ? parseInt(process.env.ATLAS_PORT, 10) : (config.port || 5055);
    const sessions: Record<string, { port: number, pid: number, project: string }> = (await fs.pathExists(registryPath)) 
        ? await fs.readJson(registryPath) 
        : {};

    // Prune dead sessions
    for (const key in sessions) {
        try {
            process.kill(sessions[key].pid, 0); // Check if PID exists
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
        project: config.project
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
            const plannedPath = path.join(projectRoot, '.atlas/data/planned.json');
            
            if (await fs.pathExists(plannedPath)) {
                const data = await fs.readJson(plannedPath);
                for (const id in updates) {
                    const node = data.plannedNodes.find((n: any) => n.id === id);
                    if (node) {
                        node.x = updates[id].x;
                        node.y = updates[id].y;
                    }
                }
                await fs.outputJson(plannedPath, data, { spaces: 2 });
                console.log(`[Atlas] Saved ${Object.keys(updates).length} node positions to planned.json`);
                res.json({ success: true });
            } else {
                res.status(404).json({ error: "planned.json not found" });
            }
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
            
            await fs.outputJson(path.join(dataDir, 'atlas.json'), registry, { spaces: 2 });
            console.log(`[Atlas] Scan complete and atlas.json updated.`);
            
            // Sync pipeline tasks with the new topology state
            await PipelineManager.sync();
            
            return registry;
        } finally {
            isScanning = false;
        }
    };

    // Serve from .atlas/viewer/dist
    const viewerDist = path.join(projectRoot, '.atlas/viewer/dist');
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
    app.use('/viewer', express.static(viewerDist));
    app.get('/data/atlas.json', (req, res) => res.sendFile(dataFile));
    app.get(/\/viewer.*/, (req, res) => res.sendFile(path.join(viewerDist, 'index.html')));

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
