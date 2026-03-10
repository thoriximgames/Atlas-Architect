"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const chokidar_1 = __importDefault(require("chokidar"));
const child_process_1 = require("child_process");
const AtlasEngine_1 = require("./Core/Application/AtlasEngine");
const FileScanner_1 = require("./Core/Infrastructure/FileSystem/FileScanner");
const GraphBuilder_1 = require("./Core/Infrastructure/Graph/GraphBuilder");
const PolarLayoutStrategy_1 = require("./Core/Infrastructure/Layout/PolarLayoutStrategy");
const pipeline_1 = require("./pipeline");
const blueprint_1 = require("./blueprint");
const Broadcaster_1 = require("./Core/Application/Broadcaster");
/**
 * Atlas Architect Root: The primary entry point and Composition Root for the backend engine.
 */
async function main() {
    const cwd = process.cwd();
    const app = (0, express_1.default)();
    const broadcaster = new Broadcaster_1.Broadcaster();
    const isScanOnly = process.argv.includes('--scan-only');
    const isSlice = process.argv.includes('slice');
    const isCLI = isScanOnly || isSlice;
    let projectRoot = cwd;
    const targetIndex = process.argv.indexOf('--target');
    if (targetIndex !== -1 && process.argv.length > targetIndex + 1) {
        projectRoot = path_1.default.resolve(process.argv[targetIndex + 1]);
    }
    else if (path_1.default.basename(cwd) === '.atlas') {
        projectRoot = path_1.default.resolve(cwd, '..');
    }
    let configPath = path_1.default.join(projectRoot, 'atlas.config.json');
    let config;
    if (await fs_extra_1.default.pathExists(configPath)) {
        config = await fs_extra_1.default.readJson(configPath);
    }
    else {
        const internalConfig = path_1.default.join(projectRoot, '.atlas', 'atlas.config.json');
        if (await fs_extra_1.default.pathExists(internalConfig)) {
            config = await fs_extra_1.default.readJson(internalConfig);
        }
        else {
            console.error(`atlas.config.json not found in ${projectRoot} or .atlas/`);
            process.exit(1);
        }
    }
    config.scanPatterns = config.scanPatterns || ["src/**/*.ts", "src/**/*.js", "src/**/*.tsx", "src/**/*.jsx"];
    config.entryPoints = config.entryPoints || [];
    config.exclude = config.exclude || [];
    const homedir = process.env.USERPROFILE || process.env.HOME || "";
    const registryDir = path_1.default.join(homedir, '.gemini');
    const registryPath = path_1.default.join(registryDir, 'atlas_sessions.json');
    await fs_extra_1.default.ensureDir(registryDir);
    let port = process.env.ATLAS_PORT ? parseInt(process.env.ATLAS_PORT, 10) : (config.port || 5055);
    const sessions = (await fs_extra_1.default.pathExists(registryPath))
        ? await fs_extra_1.default.readJson(registryPath) : {};
    if (!isCLI) {
        for (const key in sessions) {
            try {
                process.kill(sessions[key].pid, 0);
                if (sessions[key].project === config.project || key === config.project) {
                    console.log(`[Atlas] Killing existing ghost instance for project: ${config.project} (PID: ${sessions[key].pid}, Port: ${sessions[key].port})`);
                    process.kill(sessions[key].pid);
                    delete sessions[key];
                }
            }
            catch (e) {
                delete sessions[key];
            }
        }
        const takenPorts = new Set(Object.values(sessions).map(s => s.port));
        while (takenPorts.has(port))
            port++;
        sessions[config.project] = { port, pid: process.pid, project: config.project, path: projectRoot };
        await fs_extra_1.default.outputJson(registryPath, sessions, { spaces: 2 });
    }
    const scanner = new FileScanner_1.FileScanner();
    const graphBuilder = new GraphBuilder_1.GraphBuilder();
    const layoutStrategy = new PolarLayoutStrategy_1.PolarLayoutStrategy();
    const engine = new AtlasEngine_1.AtlasEngine(scanner, graphBuilder, layoutStrategy);
    app.use(express_1.default.json());
    app.use((req, res, next) => {
        if (!req.url.includes('/api/events'))
            console.log(`[Express] ${req.method} ${req.url}`);
        next();
    });
    app.get('/api/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        broadcaster.addClient(res);
    });
    const enrichData = async (data) => {
        const realityPath = path_1.default.join(projectRoot, '.atlas/data/reality.json');
        if (await fs_extra_1.default.pathExists(realityPath)) {
            const realityData = await fs_extra_1.default.readJson(realityPath);
            const realityNodes = realityData.nodes || {};
            data.project = realityData.project || config.project || "Unknown Project";
            data.plannedNodes = data.plannedNodes.map((pn) => {
                const rn = realityNodes[pn.id];
                return {
                    ...pn,
                    status: rn ? 'verified' : 'planned',
                    language: rn?.language || 'Unknown',
                    complexity: rn?.complexity || 0,
                    methods: rn?.methods || [],
                    fields: rn?.fields || [],
                    events: rn?.events || [],
                    file: rn?.file || pn.id,
                    baseClasses: rn?.baseClasses || [],
                    purpose: pn.purpose || rn?.purpose || "",
                    description: pn.description || rn?.description || "",
                    x: pn.x !== undefined ? pn.x : (rn?.x || 0),
                    y: pn.y !== undefined ? pn.y : (rn?.y || 0)
                };
            });
            const plannedIds = new Set(data.plannedNodes.map((n) => n.id));
            const orphans = Object.values(realityNodes).filter((rn) => !plannedIds.has(rn.id) && rn.id !== '_UNCONNECTED_');
            if (orphans.length > 0) {
                if (!plannedIds.has('_UNCONNECTED_')) {
                    const uNode = realityNodes['_UNCONNECTED_'] || { x: -1000, y: -1000 };
                    data.plannedNodes.push({ id: '_UNCONNECTED_', name: 'UNCONNECTED', type: 'Unknown', purpose: 'Orphaned Code', x: uNode.x, y: uNode.y });
                }
                orphans.forEach((o) => {
                    data.plannedNodes.push({ ...o, parentId: '_UNCONNECTED_', status: 'orphan' });
                });
            }
        }
        return data;
    };
    const savePositions = async (updates, isPlanMode) => {
        const data = await blueprint_1.TopologyPlanner.loadBlueprint(isPlanMode);
        const dataDir = path_1.default.join(projectRoot, '.atlas/data');
        const positionsPath = path_1.default.join(dataDir, 'positions.json');
        const realityPath = path_1.default.join(dataDir, 'reality.json');
        let intentModified = false;
        for (const id in updates) {
            const node = data.plannedNodes.find((n) => n.id === id);
            if (node) {
                node.x = updates[id].x;
                node.y = updates[id].y;
                intentModified = true;
            }
        }
        if (intentModified)
            await blueprint_1.TopologyPlanner.saveBlueprint(data, isPlanMode, true);
        let positions = {};
        if (await fs_extra_1.default.pathExists(positionsPath))
            positions = await fs_extra_1.default.readJson(positionsPath);
        for (const id in updates)
            positions[id] = updates[id];
        await fs_extra_1.default.outputJson(positionsPath, positions, { spaces: 2 });
        if (await fs_extra_1.default.pathExists(realityPath)) {
            const realityData = await fs_extra_1.default.readJson(realityPath);
            if (realityData.nodes) {
                for (const id in updates) {
                    if (realityData.nodes[id]) {
                        realityData.nodes[id].x = updates[id].x;
                        realityData.nodes[id].y = updates[id].y;
                        realityData.nodes[id].initialX = updates[id].x;
                        realityData.nodes[id].initialY = updates[id].y;
                    }
                }
                await fs_extra_1.default.outputJson(realityPath, realityData, { spaces: 2 });
            }
        }
    };
    app.post('/api/topology/sync', async (req, res) => {
        try {
            await scanAndResolve();
            const realityPath = path_1.default.join(projectRoot, '.atlas/data/reality.json');
            const realityData = await fs_extra_1.default.pathExists(realityPath) ? await fs_extra_1.default.readJson(realityPath) : { nodes: {} };
            res.json({ success: true, realityData });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get('/api/topology/state', async (req, res) => {
        const isLocked = await blueprint_1.TopologyPlanner.isLocked();
        res.json({ planningActive: isLocked, locked: isLocked });
    });
    app.get('/api/blueprint', async (req, res) => {
        const data = await blueprint_1.TopologyPlanner.loadBlueprint(false);
        res.json(await enrichData(data));
    });
    app.post('/api/blueprint/positions', async (req, res) => {
        try {
            await savePositions(req.body, false);
            res.json({ success: true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get('/api/plan', async (req, res) => {
        const data = await blueprint_1.TopologyPlanner.loadBlueprint(true);
        res.json(await enrichData(data));
    });
    app.post('/api/plan/positions', async (req, res) => {
        try {
            await savePositions(req.body, true);
            res.json({ success: true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.post('/api/plan/merge', async (req, res) => {
        try {
            await blueprint_1.TopologyPlanner.promote();
            res.json({ success: true });
        }
        catch (e) {
            console.error(`[Promote Error] ${e.message}`);
            res.status(400).json({ error: e.message });
        }
    });
    app.get('/api/config/node-types', async (req, res) => {
        const typesPath = path_1.default.join(projectRoot, '.atlas', 'data', 'node_types.json');
        if (await fs_extra_1.default.pathExists(typesPath)) {
            const types = await fs_extra_1.default.readJson(typesPath);
            res.json(types);
        }
        else {
            res.status(404).json({ error: 'Node types config not found' });
        }
    });
    let isScanning = false;
    const scanAndResolve = async (shouldBroadcast = true) => {
        if (isScanning)
            return;
        isScanning = true;
        try {
            console.log(`[Atlas] Rescanning...`);
            const registry = await engine.run(projectRoot, config);
            const dataDir = path_1.default.join(projectRoot, '.atlas/data');
            await fs_extra_1.default.ensureDir(dataDir);
            const positionsPath = path_1.default.join(dataDir, 'positions.json');
            if (await fs_extra_1.default.pathExists(positionsPath)) {
                const positions = await fs_extra_1.default.readJson(positionsPath);
                for (const id in registry.nodes) {
                    if (positions[id]) {
                        registry.nodes[id].x = positions[id].x;
                        registry.nodes[id].y = positions[id].y;
                        registry.nodes[id].initialX = positions[id].x;
                        registry.nodes[id].initialY = positions[id].y;
                    }
                }
            }
            await fs_extra_1.default.outputJson(path_1.default.join(dataDir, 'reality.json'), registry, { spaces: 2 });
            console.log(`[Atlas] Scan complete and reality.json updated.`);
            if (shouldBroadcast)
                broadcaster.broadcast('scan-complete');
            await pipeline_1.PipelineManager.sync();
            return registry;
        }
        finally {
            isScanning = false;
        }
    };
    const engineRoot = path_1.default.resolve(__dirname, '..');
    const viewerDist = path_1.default.join(engineRoot, 'viewer/dist');
    const realityFile = path_1.default.join(projectRoot, '.atlas/data/reality.json');
    app.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
        next();
    });
    app.get('/', (req, res) => res.redirect('/viewer/'));
    app.use('/viewer', express_1.default.static(viewerDist, { dotfiles: 'allow' }));
    app.get('/data/reality.json', (req, res) => res.sendFile(realityFile, { dotfiles: 'allow' }));
    app.get(/\/viewer.*/, (req, res) => res.sendFile(path_1.default.join(viewerDist, 'index.html'), { dotfiles: 'allow' }));
    const watchPaths = [
        ...config.scanPatterns.map((p) => path_1.default.join(projectRoot, p.replace('**/*', ''))),
        path_1.default.join(projectRoot, '.atlas/data/plan.json'),
        path_1.default.join(projectRoot, 'docs/topology/blueprint.json')
    ];
    chokidar_1.default.watch(watchPaths, { ignoreInitial: true }).on('all', (event, p) => {
        if (p.endsWith('plan.json') || p.endsWith('blueprint.json')) {
            if (event === 'add' || event === 'unlink' || event === 'change') {
                const type = p.endsWith('plan.json') && (event === 'add' || event === 'unlink') ? 'lock-state-changed' : 'intent-updated';
                console.log(`[Atlas] Intent state changed (${event} on ${path_1.default.basename(p)}). Broadcasting ${type}.`);
                broadcaster.broadcast(type);
            }
            return;
        }
        if (p.endsWith('.json') || p.endsWith('.md'))
            return;
        scanAndResolve();
    });
    await scanAndResolve();
    if (isCLI) {
        process.exit(0);
    }
    app.listen(port, () => {
        const url = `http://localhost:${port}/viewer/`;
        console.log(`\n================================================================`);
        console.log(`Atlas v8.0 [${config.project}]`);
        console.log(`URL:  ${url}`);
        console.log(`PID:  ${process.pid}`);
        console.log(`================================================================\n`);
        if (!isCLI) {
            const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
            (0, child_process_1.exec)(`${start} ${url}`);
        }
    });
}
main();
