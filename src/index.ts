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
 */
async function main() {
    const cwd = process.cwd();
    const app = express();
    const broadcaster = new Broadcaster();

    const isScanOnly = process.argv.includes('--scan-only');
    const isSlice = process.argv.includes('slice');
    const isCLI = isScanOnly || isSlice;

    let projectRoot = cwd;
    const targetIndex = process.argv.indexOf('--target');
    if (targetIndex !== -1 && process.argv.length > targetIndex + 1) {
        projectRoot = path.resolve(process.argv[targetIndex + 1]);
    } else if (path.basename(cwd) === '.atlas') {
        projectRoot = path.resolve(cwd, '..');
    }

    let configPath = path.join(projectRoot, 'atlas.config.json');
    let config: IAtlasConfig;
    if (await fs.pathExists(configPath)) {
        config = await fs.readJson(configPath);
    } else {
        const internalConfig = path.join(projectRoot, '.atlas', 'atlas.config.json');
        if (await fs.pathExists(internalConfig)) {
             config = await fs.readJson(internalConfig);
        } else {
             console.error(`atlas.config.json not found in ${projectRoot} or .atlas/`);
             process.exit(1);
        }
    }

    config.scanPatterns = config.scanPatterns || ["src/**/*.ts", "src/**/*.js", "src/**/*.tsx", "src/**/*.jsx"];
    config.entryPoints = config.entryPoints || [];
    config.exclude = config.exclude || [];

    const homedir = process.env.USERPROFILE || process.env.HOME || "";
    const registryDir = path.join(homedir, '.gemini');
    const registryPath = path.join(registryDir, 'atlas_sessions.json');
    await fs.ensureDir(registryDir);
    
    let port = process.env.ATLAS_PORT ? parseInt(process.env.ATLAS_PORT, 10) : (config.port || 5055);
    const sessions: Record<string, { port: number, pid: number, project: string, path?: string }> = (await fs.pathExists(registryPath)) 
        ? await fs.readJson(registryPath) : {};

    if (!isCLI) {
        for (const key in sessions) {
            try {
                process.kill(sessions[key].pid, 0); 
                if (sessions[key].project === config.project || key === config.project) {
                    console.log(`[Atlas] Killing existing ghost instance for project: ${config.project} (PID: ${sessions[key].pid}, Port: ${sessions[key].port})`);
                    process.kill(sessions[key].pid);
                    delete sessions[key];
                }
            } catch (e) {
                delete sessions[key];
            }
        }
        const takenPorts = new Set(Object.values(sessions).map(s => s.port));
        if (takenPorts.has(port)) {
            console.error(`[Atlas] Warning: Port ${port} is registered in a previous session. It may be in TIME_WAIT.`);
        }
        sessions[config.project] = { port, pid: process.pid, project: config.project, path: projectRoot };
        await fs.outputJson(registryPath, sessions, { spaces: 2 });
    }

    const scanner = new FileScanner();
    const graphBuilder = new GraphBuilder();
    const layoutStrategy = new PolarLayoutStrategy();
    const engine = new AtlasEngine(scanner, graphBuilder, layoutStrategy);

    app.use(express.json());
    app.use((req, res, next) => {
        if (!req.url.includes('/api/events')) console.log(`[Express] ${req.method} ${req.url}`);
        next();
    });

    app.get('/api/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        broadcaster.addClient(res);
    });

    const enrichData = async (data: any) => {
        const realityPath = path.join(projectRoot, '.atlas/data/reality.json');
        if (await fs.pathExists(realityPath)) {
            const realityData = await fs.readJson(realityPath);
            const realityNodes = realityData.nodes || {};
            data.project = realityData.project || config.project || "Unknown Project";
            data.plannedNodes = data.plannedNodes.map((pn: any) => {
                const rn = realityNodes[pn.id];
                return {
                    ...pn,
                    status: rn ? 'verified' : 'planned',
                    type: (rn && rn.type !== 'Unknown' ? rn.type : pn.type) || 'Unknown',
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
            const plannedIds = new Set(data.plannedNodes.map((n:any) => n.id));
            const orphans = Object.values(realityNodes).filter((rn: any) => !plannedIds.has(rn.id) && rn.id !== '_UNCONNECTED_');
            if (orphans.length > 0) {
                if (!plannedIds.has('_UNCONNECTED_')) {
                    const uNode = realityNodes['_UNCONNECTED_'] || { x: -1000, y: -1000 };
                    data.plannedNodes.push({ 
                        id: '_UNCONNECTED_', 
                        name: 'UNCONNECTED', 
                        type: 'Unknown', 
                        purpose: 'Orphaned Code', 
                        status: 'orphan',
                        x: uNode.x !== undefined ? uNode.x : (uNode.initialX || -1000), 
                        y: uNode.y !== undefined ? uNode.y : (uNode.initialY || -1000) 
                    });
                }
                orphans.forEach((o: any) => {
                    data.plannedNodes.push({ ...o, parentId: '_UNCONNECTED_', status: 'orphan' });
                });
            }
        }
        return data;
    };

    const savePositions = async (updates: any, isPlanMode: boolean) => {
        const data = await TopologyPlanner.loadBlueprint(isPlanMode);
        const dataDir = path.join(projectRoot, '.atlas/data');
        const positionsPath = path.join(dataDir, 'positions.json');
        const realityPath = path.join(dataDir, 'reality.json');
        let intentModified = false;
        for (const id in updates) {
            const node = data.plannedNodes.find((n: any) => n.id === id);
            if (node) {
                node.x = updates[id].x;
                node.y = updates[id].y;
                intentModified = true;
            }
        }
        if (intentModified) await TopologyPlanner.saveBlueprint(data, isPlanMode, true); 
        let positions: Record<string, { x: number, y: number }> = {};
        if (await fs.pathExists(positionsPath)) positions = await fs.readJson(positionsPath);
        for (const id in updates) positions[id] = updates[id];
        await fs.outputJson(positionsPath, positions, { spaces: 2 });
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
    };

    app.post('/api/topology/sync', async (req, res) => {
        try {
            await scanAndResolve();
            const realityPath = path.join(projectRoot, '.atlas/data/reality.json');
            const realityData = await fs.pathExists(realityPath) ? await fs.readJson(realityPath) : { nodes: {} };
            res.json({ success: true, realityData });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/topology/state', async (req, res) => {
        const isLocked = await TopologyPlanner.isLocked();
        res.json({ planningActive: isLocked, locked: isLocked });
    });

    app.get('/api/blueprint', async (req, res) => {
        const data = await TopologyPlanner.loadBlueprint(false);
        res.json(await enrichData(data));
    });

    app.post('/api/blueprint/positions', async (req, res) => {
        try {
            await savePositions(req.body, false);
            res.json({ success: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/plan', async (req, res) => {
        const data = await TopologyPlanner.loadBlueprint(true);
        res.json(await enrichData(data));
    });

    app.post('/api/plan/positions', async (req, res) => {
        try {
            await savePositions(req.body, true);
            res.json({ success: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/plan/merge', async (req, res) => {
        try {
            await TopologyPlanner.promote();
            res.json({ success: true });
        } catch (e: any) {
            console.error(`[Promote Error] ${e.message}`);
            res.status(400).json({ error: e.message });
        }
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

    let scanPromise: Promise<any> | null = null;
    const scanAndResolve = async (shouldBroadcast: boolean = true) => {
        if (scanPromise) return scanPromise;

        scanPromise = (async () => {
            try {
                console.log(`[Atlas] Rescanning...`);
                const registry = await engine.run(projectRoot, config);
                const dataDir = path.join(projectRoot, '.atlas/data');
                await fs.ensureDir(dataDir);
                await fs.outputJson(path.join(dataDir, 'reality.json'), registry, { spaces: 2 });
                console.log(`[Atlas] Scan complete and reality.json updated.`);
                if (shouldBroadcast) broadcaster.broadcast('scan-complete');
                await PipelineManager.sync();
                return registry;
            } finally {
                scanPromise = null;
            }
        })();
        return scanPromise;
    };

    const engineRoot = path.resolve(__dirname, '..');
    const viewerDist = path.join(engineRoot, 'viewer/dist');
    const realityFile = path.join(projectRoot, '.atlas/data/reality.json');

    app.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
        next();
    });

    app.get('/', (req, res) => res.redirect('/viewer/'));
    app.use('/viewer', express.static(viewerDist, { dotfiles: 'allow' }));
    app.get('/data/reality.json', (req, res) => res.sendFile(realityFile, { dotfiles: 'allow' }));
    app.get(/\/viewer.*/, (req, res) => res.sendFile(path.join(viewerDist, 'index.html'), { dotfiles: 'allow' }));

    const watchPaths = [
        ...config.scanPatterns.map((p: string) => path.join(projectRoot, p.replace('**/*', ''))),
        path.join(projectRoot, '.atlas/data/plan.json'),
        path.join(projectRoot, 'docs/topology/blueprint.json')
    ];

    chokidar.watch(watchPaths, { ignoreInitial: true }).on('all', (event, p) => {
        if (p.endsWith('plan.json') || p.endsWith('blueprint.json')) {
            if (event === 'add' || event === 'unlink' || event === 'change') {
                const type = p.endsWith('plan.json') && (event === 'add' || event === 'unlink') ? 'lock-state-changed' : 'intent-updated';
                console.log(`[Atlas] Intent state changed (${event} on ${path.basename(p)}). Broadcasting ${type}.`);
                broadcaster.broadcast(type);
            }
            return;
        }
        if (p.endsWith('.json') || p.endsWith('.md')) return; 
        scanAndResolve();
    });

    await scanAndResolve();

    if (isCLI) {
        process.exit(0);
    }

    const server = app.listen(port, () => {
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

    server.on('error', (e: any) => {
        if (e.code === 'EADDRINUSE') {
            console.error(`\n[FATAL] Port ${port} is already in use.`);
            console.error(`        The Atlas service enforces a Singleton Rule. Do NOT use taskkill.`);
            console.error(`        If a zombie process exists, wait for TIME_WAIT to resolve or run:`);
            console.error(`        node atlas.mjs kill`);
            process.exit(1);
        } else {
            console.error(`[FATAL] Server error:`, e);
            process.exit(1);
        }
    });
}
main();
