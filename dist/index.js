"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const chokidar_1 = __importDefault(require("chokidar"));
const AtlasEngine_1 = require("./Core/Application/AtlasEngine");
const FileScanner_1 = require("./Core/Infrastructure/FileSystem/FileScanner");
const GraphBuilder_1 = require("./Core/Infrastructure/Graph/GraphBuilder");
const PolarLayoutStrategy_1 = require("./Core/Infrastructure/Layout/PolarLayoutStrategy");
const pipeline_1 = require("./pipeline");
async function main() {
    const cwd = process.cwd();
    const app = (0, express_1.default)();
    // Context Detection
    let projectRoot = cwd;
    let configPath = path_1.default.join(cwd, 'atlas.config.json');
    // If running from inside .atlas, go up
    if (path_1.default.basename(cwd) === '.atlas') {
        projectRoot = path_1.default.resolve(cwd, '..');
        configPath = path_1.default.join(projectRoot, 'atlas.config.json');
    }
    // Load Config
    let config;
    if (await fs_extra_1.default.pathExists(configPath)) {
        config = await fs_extra_1.default.readJson(configPath);
    }
    else {
        // Fallback: Check if config is in .atlas folder
        const internalConfig = path_1.default.join(projectRoot, '.atlas', 'atlas.config.json');
        if (await fs_extra_1.default.pathExists(internalConfig)) {
            config = await fs_extra_1.default.readJson(internalConfig);
        }
        else {
            console.error(`atlas.config.json not found in ${projectRoot} or .atlas/`);
            process.exit(1);
        }
    }
    // --- AUTO-PORT DISCOVERY & SESSION REGISTRY ---
    const homedir = process.env.USERPROFILE || process.env.HOME || "";
    const registryDir = path_1.default.join(homedir, '.gemini');
    const registryPath = path_1.default.join(registryDir, 'atlas_sessions.json');
    await fs_extra_1.default.ensureDir(registryDir);
    let port = process.env.ATLAS_PORT ? parseInt(process.env.ATLAS_PORT, 10) : (config.port || 5055);
    const sessions = (await fs_extra_1.default.pathExists(registryPath))
        ? await fs_extra_1.default.readJson(registryPath)
        : {};
    // Prune dead sessions
    for (const key in sessions) {
        try {
            process.kill(sessions[key].pid, 0); // Check if PID exists
        }
        catch (e) {
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
    await fs_extra_1.default.outputJson(registryPath, sessions, { spaces: 2 });
    // --- END REGISTRY LOGIC ---
    // Composition Root
    const scanner = new FileScanner_1.FileScanner();
    const graphBuilder = new GraphBuilder_1.GraphBuilder();
    const layoutStrategy = new PolarLayoutStrategy_1.PolarLayoutStrategy();
    const engine = new AtlasEngine_1.AtlasEngine(scanner, graphBuilder, layoutStrategy);
    // --- MIDDLEWARE & LOGGING ---
    app.use(express_1.default.json());
    app.use((req, res, next) => {
        console.log(`[Express] ${req.method} ${req.url}`);
        next();
    });
    // --- API ROUTES ---
    app.post('/api/topology/positions', async (req, res) => {
        try {
            const updates = req.body;
            const plannedPath = path_1.default.join(projectRoot, '.atlas/data/planned.json');
            if (await fs_extra_1.default.pathExists(plannedPath)) {
                const data = await fs_extra_1.default.readJson(plannedPath);
                for (const id in updates) {
                    const node = data.plannedNodes.find((n) => n.id === id);
                    if (node) {
                        node.x = updates[id].x;
                        node.y = updates[id].y;
                    }
                }
                await fs_extra_1.default.outputJson(plannedPath, data, { spaces: 2 });
                console.log(`[Atlas] Saved ${Object.keys(updates).length} node positions to planned.json`);
                res.json({ success: true });
            }
            else {
                res.status(404).json({ error: "planned.json not found" });
            }
        }
        catch (e) {
            console.error(`[API Error] ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });
    let isScanning = false;
    const scanAndResolve = async () => {
        if (isScanning)
            return;
        isScanning = true;
        try {
            console.log(`[Atlas] Rescanning...`);
            const registry = await engine.run(projectRoot, config);
            // Ensure data directory exists
            const dataDir = path_1.default.join(projectRoot, '.atlas/data');
            await fs_extra_1.default.ensureDir(dataDir);
            await fs_extra_1.default.outputJson(path_1.default.join(dataDir, 'atlas.json'), registry, { spaces: 2 });
            console.log(`[Atlas] Scan complete and atlas.json updated.`);
            // Sync pipeline tasks with the new topology state
            await pipeline_1.PipelineManager.sync();
            return registry;
        }
        finally {
            isScanning = false;
        }
    };
    // Serve from .atlas/viewer/dist
    const viewerDist = path_1.default.join(projectRoot, '.atlas/viewer/dist');
    const dataFile = path_1.default.join(projectRoot, '.atlas/data/atlas.json');
    // CSP and Basic Headers
    app.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
        next();
    });
    app.get('/', (req, res) => {
        console.log(`[Atlas] Root hit! Redirecting to /viewer/...`);
        res.redirect('/viewer/');
    });
    app.use('/viewer', express_1.default.static(viewerDist));
    app.get('/data/atlas.json', (req, res) => res.sendFile(dataFile));
    app.get(/\/viewer.*/, (req, res) => res.sendFile(path_1.default.join(viewerDist, 'index.html')));
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
        if (await fs_extra_1.default.pathExists(dataFile)) {
            const registry = await fs_extra_1.default.readJson(dataFile);
            const sliced = AtlasEngine_1.AtlasEngine.slice(registry, targetId, depth);
            console.log(JSON.stringify(sliced, null, 2));
            process.exit(0);
        }
        else {
            console.error("atlas.json not found. Run a scan first.");
            process.exit(1);
        }
    }
    // Watcher for automatic updates
    const watchPaths = [
        path_1.default.join(projectRoot, 'docs/pipeline'),
        path_1.default.join(projectRoot, 'docs/topology'),
        ...config.scanPatterns.map(p => path_1.default.join(projectRoot, p.replace('**/*', '')))
    ];
    chokidar_1.default.watch(watchPaths, { ignoreInitial: true }).on('all', (event, path) => {
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
