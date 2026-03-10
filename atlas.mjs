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
            if (process.platform === 'win32') {
                execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
            } else {
                process.kill(pid, 'SIGKILL');
            }
            // Give it a moment to release the port
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
            // Already dead or permission denied
        }
        delete sessions[projectName];
        await fs.outputJson(REGISTRY_PATH, sessions, { spaces: 2 });
    }
}

async function runCommand(cmd, args, options = {}) {
    return new Promise((resolve, reject) => {
        // If using shell, ensure arguments with spaces are quoted so they aren't split by the shell
        const safeArgs = args.map(a => typeof a === 'string' && a.includes(' ') ? `"${a}"` : a);
        const proc = spawn(cmd, safeArgs, { stdio: 'inherit', shell: true, ...options });
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
            strict: true,
            scanPatterns: [
                "src/**/*.ts", "src/**/*.js", "src/**/*.tsx", "src/**/*.jsx", 
                "Assets/**/*.cs", "src/**/*.cpp", "src/**/*.h", "src/**/*.py"
            ],
            entryPoints: [],
            exclude: [
                "**/node_modules/**", "**/Library/**", "**/obj/**", "**/bin/**", 
                "**/dist/**", "**/build/**", "**/Vendor/**", "**/.git/**", "**/.vs/**"
            ]
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
    const blueprintPath = path.join(__dirname, 'src', 'blueprint-cli.ts');
    const blueprintDistPath = path.join(__dirname, 'dist', 'blueprint-cli.js');

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
            const planCmdArgs = args.slice(1).filter(a => a !== '--target' && a !== args[targetIdx + 1]);
            const subCmd = planCmdArgs[0];
            const plannerCommands = ['start', 'add', 'set', 'remove', 'merge', 'get'];
            
            if (plannerCommands.includes(subCmd)) {
                // Route topology drafting commands to the planner CLI
                await runCommand(runner, [...loaderArgs, blueprintScript, ...planCmdArgs, '--target', target]);
            } else {
                // Route pipeline task commands to the pipeline CLI
                await runCommand(runner, [...loaderArgs, pipeScript, ...planCmdArgs, '--target', target]);
            }
            break;

        case 'blueprint':
            const blueprintCmdArgs = args.slice(1).filter(a => a !== '--target' && a !== args[targetIdx + 1]);
            await runCommand(runner, [...loaderArgs, blueprintScript, 'blueprint', ...blueprintCmdArgs, '--target', target]);
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
                const SHAPES = ['circle', 'square', 'hexagon', 'octagon', 'diamond', 'triangle', 'pentagon'];
                
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
                        console.log(`Shapes: ${SHAPES.join(', ')}`);
                        process.exit(1);
                    }

                    if (!SHAPES.includes(shape)) {
                        console.error(`[Atlas] Error: Invalid shape '${shape}'. Supported: ${SHAPES.join(', ')}`);
                        process.exit(1);
                    }
                    
                    typeConfig[typeName] = {
                        id: typeName,
                        keywords: keywords.split(',').map(k => k.trim()),
                        style: { fill, stroke, text: '#444444' },
                        legend: { label: typeName.toUpperCase(), desc, shape }
                    };
                    
                    await fs.outputJson(typesPath, typeConfig, { spaces: 4 });
                    console.log(`[Atlas] SUCCESS: Saved node type '${typeName}'.`);
                } else if (typeCmd === 'set') {
                    const typeName = args[2];
                    const prop = args[3];
                    const value = args[4];

                    if (!typeConfig[typeName]) {
                        console.error(`[Atlas] Error: Type '${typeName}' not found.`);
                        process.exit(1);
                    }

                    if (prop === 'shape') {
                        if (!SHAPES.includes(value)) {
                            console.error(`[Atlas] Error: Invalid shape '${value}'.`);
                            process.exit(1);
                        }
                        typeConfig[typeName].legend.shape = value;
                    } else if (prop === 'fill') {
                        typeConfig[typeName].style.fill = value;
                    } else if (prop === 'stroke') {
                        typeConfig[typeName].style.stroke = value;
                    } else if (prop === 'keywords') {
                        typeConfig[typeName].keywords = value.split(',').map(k => k.trim());
                    } else {
                        console.error(`[Atlas] Error: Unsupported property '${prop}'. Use: shape, fill, stroke, keywords`);
                        process.exit(1);
                    }

                    await fs.outputJson(typesPath, typeConfig, { spaces: 4 });
                    console.log(`[Atlas] SUCCESS: Updated ${prop} for '${typeName}'.`);
                } else if (typeCmd === 'shapes') {
                    console.log('\n[Atlas] Supported Node Shapes:');
                    console.log('=============================');
                    SHAPES.forEach(s => console.log(` - ${s}`));
                    console.log('');
                } else if (typeCmd === 'list') {
                    console.log('\n[Atlas] Defined Node Types:');
                    console.log('===========================');
                    for (const id in typeConfig) {
                        const t = typeConfig[id];
                        console.log(`${id.padEnd(12)} | ${t.legend.shape.padEnd(8)} | ${t.style.fill} | ${t.keywords.join(', ')}`);
                    }
                    console.log('');
                } else {
                    console.log('Commands: add, list, shapes, set');
                }
            }
            break;

        case 'kill':
            await killProjectSession(config.project);
            break;

        case 'build':
            await runCommand('npm', ['run', 'build']);
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
