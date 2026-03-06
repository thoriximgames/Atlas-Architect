#!/usr/bin/env node

/**
 * Atlas Unified Toolbox (v8.1.0)
 * The authoritative CLI for Atlas Architect operations.
 * Usage: node atlas.mjs <command> [args] [--target <path>]
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REGISTRY_PATH = path.join(process.env.USERPROFILE || process.env.HOME || "", '.gemini', 'atlas_sessions.json');

async function getProjectConfig(target) {
    const configPath = path.join(target, 'atlas.config.json');
    const altConfigPath = path.join(target, '.atlas', 'atlas.config.json');
    
    if (await fs.pathExists(configPath)) return await fs.readJson(configPath);
    if (await fs.pathExists(altConfigPath)) return await fs.readJson(altConfigPath);
    return null;
}

async function killProjectSession(projectName) {
    if (!await fs.pathExists(REGISTRY_PATH)) return;
    const sessions = await fs.readJson(REGISTRY_PATH);
    
    if (sessions[projectName]) {
        const { pid, port } = sessions[projectName];
        console.log(`[Atlas] Killing existing session for '${projectName}' (PID: ${pid}, Port: ${port})...`);
        try {
            process.kill(pid, 'SIGTERM');
            // Give it a moment to release the port
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
            // Already dead
        }
        delete sessions[projectName];
        await fs.outputJson(REGISTRY_PATH, sessions, { spaces: 2 });
    }
}

async function runCommand(cmd, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { stdio: 'inherit', shell: true, ...options });
        proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Command failed with code ${code}`)));
    });
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    // Parse --target flag safely
    let target = process.cwd();
    const targetIdx = args.indexOf('--target');
    if (targetIdx !== -1 && args.length > targetIdx + 1) {
        target = path.resolve(args[targetIdx + 1]);
    }

    // Handle 'init' early as it doesn't require a config
    if (command === 'init') {
        const projectName = args[1] && args[1] !== '--target' ? args[1] : path.basename(target);
        const defaultPort = 5055;
        
        console.log(`[Atlas] Initializing footprint for '${projectName}' in ${target}...`);
        
        const configContent = {
            project: projectName,
            port: defaultPort,
            scanPatterns: ["src/**/*.ts", "src/**/*.js", "src/**/*.tsx", "src/**/*.jsx"],
            entryPoints: [],
            exclude: []
        };

        const atlasDir = path.join(target, '.atlas');
        const docsDir = path.join(target, 'docs', 'topology');
        const dataDir = path.join(atlasDir, 'data');
        
        await fs.ensureDir(dataDir);
        await fs.ensureDir(docsDir);
        await fs.outputJson(path.join(atlasDir, 'atlas.config.json'), configContent, { spaces: 2 });
        await fs.outputJson(path.join(docsDir, 'planned.json'), { plannedNodes: [] }, { spaces: 2 });
        
        console.log(`[Atlas] SUCCESS: Footprint created. You can now run 'atlas.mjs scan'.`);
        return;
    }

    const config = await getProjectConfig(target);

    if (!config && command !== 'help' && command !== undefined) {
        console.error(`[Atlas] Error: Not an Atlas project (missing atlas.config.json in ${target})`);
        console.error(`[Atlas] Run 'node atlas.mjs init --target <path>' first.`);
        process.exit(1);
    }

    const enginePath = path.join(__dirname, 'src', 'index.ts');
    const distPath = path.join(__dirname, 'dist', 'index.js');
    const pipelinePath = path.join(__dirname, 'src', 'pipeline.ts');
    const pipelineDistPath = path.join(__dirname, 'dist', 'pipeline.js');
    const blueprintPath = path.join(__dirname, 'src', 'blueprint.ts');
    const blueprintDistPath = path.join(__dirname, 'dist', 'blueprint.js');

    // Prefer compiled dist if it exists and is newer, or if we are in a "production" context
    const useTsNode = !(await fs.pathExists(distPath)); 
    const runner = useTsNode ? 'node' : 'node';
    const loaderArgs = useTsNode ? ['--loader', 'ts-node/esm'] : [];
    const mainScript = useTsNode ? enginePath : distPath;
    const pipeScript = useTsNode ? pipelinePath : pipelineDistPath;
    const blueprintScript = useTsNode ? blueprintPath : blueprintDistPath;

    switch (command) {
        case 'scan':
            console.log(`[Atlas] Checking for active session...`);
            if (await fs.pathExists(REGISTRY_PATH)) {
                const sessions = await fs.readJson(REGISTRY_PATH);
                if (sessions[config.project]) {
                    const { port } = sessions[config.project];
                    console.log(`[Atlas] Active session found on port ${port}. Pinging sync endpoint...`);
                    try {
                        // Use a simple curl-like check via node or powershell
                        execSync(`powershell -Command "Invoke-RestMethod -Method POST -Uri 'http://localhost:${port}/api/topology/sync' -ErrorAction Stop"`, { stdio: 'ignore' });
                        console.log(`[Atlas] Scan triggered successfully on running server.`);
                        return;
                    } catch (e) {
                        console.log(`[Atlas] Server not responding, falling back to local scan...`);
                    }
                }
            }
            console.log(`[Atlas] Performing Fresh Scan for '${config.project}'...`);
            await runCommand(runner, [...loaderArgs, mainScript, '--scan-only', '--target', target]);
            break;

        case 'serve':
        case 'start':
            await killProjectSession(config.project);
            
            // 1. Scan first to ensure data is fresh
            console.log(`[Atlas] Pre-start scan...`);
            await runCommand(runner, [...loaderArgs, mainScript, '--scan-only', '--target', target]);

            // 2. Build viewer if dist is missing
            const viewerDist = path.join(__dirname, 'viewer', 'dist');
            if (!await fs.pathExists(viewerDist)) {
                console.log(`[Atlas] Building Visualizer...`);
                await runCommand('npm', ['run', 'build'], { cwd: path.join(__dirname, 'viewer') });
            }

            // 3. Launch Engine
            console.log(`[Atlas] Launching Engine for '${config.project}'...`);
            // Run in background-ish mode by not waiting, or just run normally if the agent expects to wait
            await runCommand(runner, [...loaderArgs, mainScript, '--target', target]);
            break;

        case 'slice':
            const nodeId = args[1];
            const depth = args[2] || '1';
            await runCommand(runner, [...loaderArgs, mainScript, 'slice', nodeId, depth, '--target', target]);
            break;

        case 'plan':
            const planCmd = args.slice(1).filter(a => a !== '--target' && a !== args[targetIdx + 1]);
            await runCommand(runner, [...loaderArgs, pipeScript, ...planCmd, '--target', target]);
            break;

        case 'blueprint':
            const blueprintCmd = args.slice(1).filter(a => a !== '--target' && a !== args[targetIdx + 1]);
            await runCommand(runner, [...loaderArgs, blueprintScript, ...blueprintCmd, '--target', target]);
            break;

        case 'build':
            console.log(`[Atlas] Building Backend...`);
            await runCommand('npm.cmd', ['run', 'build'], { cwd: __dirname });
            console.log(`[Atlas] Building Frontend...`);
            await runCommand('npm.cmd', ['run', 'build'], { cwd: path.join(__dirname, 'viewer') });
            console.log(`[Atlas] Build complete.`);
            break;

        case 'launch':
            await killProjectSession(config.project);
            console.log(`[Atlas] Launching Engine for '${config.project}' in background...`);
            const subprocess = spawn(runner, [...loaderArgs, mainScript, '--target', target], {
                detached: true,
                stdio: 'ignore',
                shell: true
            });
            subprocess.unref();
            console.log(`[Atlas] Server started. View at: http://localhost:${config.port || 5055}/viewer/`);
            break;

        case 'type':
            {
                const typeCmd = args[1];
                const typesPath = path.join(target, '.atlas', 'data', 'node_types.json');
                
                if (!await fs.pathExists(typesPath)) {
                    console.error(`[Atlas] Error: node_types.json not found in ${target}/.atlas/data/`);
                    process.exit(1);
                }
                
                const typeConfig = await fs.readJson(typesPath);
                
                if (typeCmd === 'add') {
                    const typeName = args[2];
                    const keywords = args[3];
                    const fill = args[4];
                    const stroke = args[5];
                    const shape = args[6];
                    const desc = args[7];
                    
                    if (!typeName || !keywords || !fill || !stroke || !shape || !desc) {
                        console.log('Usage: node atlas.mjs type add <name> <keywords_comma_separated> <fill> <stroke> <shape> <desc>');
                        console.log('Example: node atlas.mjs type add Gateway "gateway,portal" #FFB8A8 #F24822 hexagon "Entry point"');
                        process.exit(1);
                    }
                    
                    typeConfig[typeName] = {
                        id: typeName,
                        keywords: keywords.split(',').map(k => k.trim()),
                        style: { fill, stroke, text: '#444444' },
                        legend: { label: typeName.toUpperCase(), desc, shape }
                    };
                    
                    await fs.outputJson(typesPath, typeConfig, { spaces: 4 });
                    console.log(`[Atlas] SUCCESS: Added node type '${typeName}'. Run 'node atlas.mjs scan' to apply.`);
                } else if (typeCmd === 'list') {
                    console.log('\n[Atlas] Defined Node Types:');
                    console.log('===========================');
                    for (const id in typeConfig) {
                        const t = typeConfig[id];
                        console.log(`${id.padEnd(12)} | ${t.legend.shape.padEnd(8)} | ${t.style.fill} | ${t.keywords.join(', ')}`);
                    }
                    console.log('');
                } else {
                    console.log('Commands: add, list');
                }
            }
            break;

        case 'kill':
            await killProjectSession(config.project);
            break;

        case 'help':
        default:
            console.log(`
Atlas Unified Toolbox (v8.2.0)
Commands:
  init [name]         Scaffold the minimal Atlas footprint in the target project
  scan                Perform a topological scan and update reality.json
  serve | start       Kill old instance, scan, build viewer (if needed), and launch
  slice <id> [depth]  Extract a neighborhood around a node
  blueprint <cmd>     Manage the intentional architecture (add, branch, guard, etc.)
  plan <cmd>          Manage the architectural pipeline (backlog, todo, etc.)
  kill                Safely terminate the Atlas process for the current project
  help                Show this help

Flags:
  --target <path>     Specify the target project directory (defaults to CWD)
            `);
            break;
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
