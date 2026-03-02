"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineManager = exports.TopologyPlanner = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
// Context Detection
const cwd = process.cwd();
let projectRoot = cwd;
if (path_1.default.basename(cwd) === '.atlas') {
    projectRoot = path_1.default.resolve(cwd, '..');
}
const PIPELINE_ROOT = path_1.default.join(projectRoot, 'docs/pipeline');
const PLANNED_PATH = path_1.default.join(projectRoot, '.atlas/data/planned.json');
const STAGES = ['00_backlog', '01_todo', '02_in_progress', '03_review', '04_completed'];
class TopologyPlanner {
    static async loadPlanned() {
        if (!await fs_extra_1.default.pathExists(PLANNED_PATH)) {
            return { plannedNodes: [] };
        }
        return await fs_extra_1.default.readJson(PLANNED_PATH);
    }
    static async savePlanned(data) {
        await fs_extra_1.default.writeJson(PLANNED_PATH, data, { spaces: 2 });
        console.log(`[PLANNER] Updated ${PLANNED_PATH}`);
    }
    static async upsertNode(id, name, type, purpose) {
        const data = await this.loadPlanned();
        let node = data.plannedNodes.find((n) => n.id === id);
        if (node) {
            node.name = name;
            node.type = type;
            node.purpose = purpose;
            console.log(`[PLANNER] Updated node: ${id}`);
        }
        else {
            data.plannedNodes.push({
                id, name, type, purpose,
                parentId: "",
                dependencies: [],
                description: ""
            });
            console.log(`[PLANNER] Added new node: ${id}`);
        }
        await this.savePlanned(data);
    }
    static async setGuard(id, authorityId, state) {
        const data = await this.loadPlanned();
        let node = data.plannedNodes.find((n) => n.id === id);
        if (!node)
            throw new Error(`Node ${id} not found in planned.json`);
        node.authorityId = authorityId;
        node.guardState = state;
        await this.savePlanned(data);
        console.log(`[PLANNER] Set Guard: ${id} is now ${state} by ${authorityId}`);
    }
    static async setAuthority(id, isAuthority) {
        const data = await this.loadPlanned();
        let node = data.plannedNodes.find((n) => n.id === id);
        if (!node)
            throw new Error(`Node ${id} not found in planned.json`);
        node.isAuthority = isAuthority;
        await this.savePlanned(data);
        console.log(`[PLANNER] Set Authority: ${id} isAuthority = ${isAuthority}`);
    }
    // --- QUERY COMMANDS ---
    static async getNode(id) {
        const data = await this.loadPlanned();
        const node = data.plannedNodes.find((n) => n.id === id);
        if (node) {
            console.log(JSON.stringify(node, null, 2));
        }
        else {
            console.log(`[QUERY] Node '${id}' not found.`);
        }
    }
    static async listNodes(filterType) {
        const data = await this.loadPlanned();
        const filtered = filterType
            ? data.plannedNodes.filter((n) => n.type === filterType)
            : data.plannedNodes;
        console.log(`\n--- PLANNED NODES (${filtered.length}) ---`);
        filtered.forEach((n) => {
            console.log(`[${n.type.padEnd(10)}] ${n.id}`);
        });
    }
    static async findNodes(pattern) {
        const data = await this.loadPlanned();
        const regex = new RegExp(pattern, 'i');
        const results = data.plannedNodes.filter((n) => regex.test(n.id) || regex.test(n.name) || regex.test(n.purpose || ""));
        console.log(`\n--- SEARCH RESULTS FOR '${pattern}' (${results.length}) ---`);
        results.forEach((n) => {
            console.log(`[${n.type.padEnd(10)}] ${n.id} (${n.name})`);
        });
    }
}
exports.TopologyPlanner = TopologyPlanner;
class PipelineManager {
    static async list() {
        console.log('\n--- CURRENT PIPELINE STATE ---');
        for (const stage of STAGES) {
            const dir = path_1.default.join(PIPELINE_ROOT, stage);
            if (!await fs_extra_1.default.pathExists(dir)) {
                console.log(`[${stage.toUpperCase()}]: Directory not found`);
                continue;
            }
            const files = await fs_extra_1.default.readdir(dir);
            console.log(`[${stage.toUpperCase()}]: ${files.length} tasks`);
            files.forEach(f => console.log(`  - ${f}`));
        }
    }
    static async move(taskId, targetStage) {
        let sourceStage = '';
        for (const stage of STAGES) {
            if (await fs_extra_1.default.pathExists(path_1.default.join(PIPELINE_ROOT, stage, taskId))) {
                sourceStage = stage;
                break;
            }
        }
        if (!sourceStage)
            throw new Error(`Task ${taskId} not found in any stage.`);
        const sourcePath = path_1.default.join(PIPELINE_ROOT, sourceStage, taskId);
        const targetPath = path_1.default.join(PIPELINE_ROOT, targetStage, taskId);
        if (targetStage === '02_in_progress') {
            const inProgressDir = path_1.default.join(PIPELINE_ROOT, '02_in_progress');
            const activeTasks = await fs_extra_1.default.readdir(inProgressDir);
            if (activeTasks.length > 0) {
                throw new Error(`CRITICAL: Pipeline Overload. Task '${activeTasks[0]}' is already in progress. Finish it first.`);
            }
        }
        await fs_extra_1.default.move(sourcePath, targetPath);
        console.log(`Successfully moved ${taskId} from ${sourceStage} to ${targetStage}`);
    }
    static async create(title) {
        const id = title.toLowerCase().replace(/\s+/g, '_') + '.md';
        const content = `# Task: ${title}

## Status: Backlog
Created: ${new Date().toISOString()}

## Requirements
- TBD

## Structural Proof (Atlas)
- [ ] Registered in planned.json`;
        await fs_extra_1.default.ensureDir(path_1.default.join(PIPELINE_ROOT, '00_backlog'));
        await fs_extra_1.default.writeFile(path_1.default.join(PIPELINE_ROOT, '00_backlog', id), content);
        console.log(`Task created: ${id}`);
    }
    static async sync() {
        const atlasPath = path_1.default.join(projectRoot, '.atlas/data/atlas.json');
        if (!await fs_extra_1.default.pathExists(PLANNED_PATH)) {
            console.log("planned.json missing. Run 'atlas scan' first.");
            return;
        }
        const plannedData = await fs_extra_1.default.readJson(PLANNED_PATH);
        let verifiedIds = new Set();
        let atlasData = {};
        if (await fs_extra_1.default.pathExists(atlasPath)) {
            atlasData = await fs_extra_1.default.readJson(atlasPath);
            verifiedIds = new Set(Object.values(atlasData.nodes || {})
                .filter((n) => n.status === 'verified')
                .map((n) => n.id));
        }
        const ghostNodes = (plannedData.plannedNodes || []).filter((n) => !verifiedIds.has(n.id));
        const nodesToAudit = Object.values(atlasData.nodes || {})
            .filter((n) => n.status === 'verified' && n.verificationStatus !== 'verified');
        console.log(`[SYNC] Found ${ghostNodes.length} Ghost Nodes and ${nodesToAudit.length} nodes needing audit.`);
        for (const node of nodesToAudit) {
            const taskId = 'audit_' + node.id.replace(/[\/\\]/g, '_').replace(/\./g, '_') + '.md';
            let exists = false;
            for (const stage of STAGES) {
                if (await fs_extra_1.default.pathExists(path_1.default.join(PIPELINE_ROOT, stage, taskId))) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                const content = `# Task: Audit Architecture - ${node.name}

## Status: Todo (Topological Audit)
Generated: ${new Date().toISOString()}

## Metadata
- **Atlas ID:** ${node.id}
- **Current Status:** ${node.verificationStatus}
- **Complexity:** ${node.complexity}

## Context
This node was automatically scanned or has changed since its last verification. 

## Requirements
- [ ] Review extracted **Methods** in Atlas for accuracy.
- [ ] Review extracted **Fields/State** for accuracy.
- [ ] Review identified **Event Flows** (Publish/Subscribe).
- [ ] Confirm the **Semantic Intent** (Description/Purpose) matches the implementation.
- [ ] Once confirmed, update the node's \`verificationStatus\` to \`verified\` in \`atlas.json\` and provide your name/signature.

## Structural Proof (Atlas)
- [x] Verified by Atlas Scanner
- [ ] Audit Completed`;
                await fs_extra_1.default.ensureDir(path_1.default.join(PIPELINE_ROOT, '01_todo'));
                await fs_extra_1.default.writeFile(path_1.default.join(PIPELINE_ROOT, '01_todo', taskId), content);
                console.log(`  + Created Audit: ${taskId}`);
            }
        }
        for (const node of ghostNodes) {
            const taskId = node.id.replace(/[\/\\]/g, '_').replace(/\./g, '_') + '.md';
            let exists = false;
            for (const stage of STAGES) {
                if (await fs_extra_1.default.pathExists(path_1.default.join(PIPELINE_ROOT, stage, taskId))) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                const lang = node.id.endsWith('.cs') ? 'C#'
                    : node.id.endsWith('.cpp') || node.id.endsWith('.h') ? 'C++'
                        : node.id.endsWith('.py') ? 'Python'
                            : node.id.endsWith('.ts') ? 'TypeScript'
                                : 'Unknown';
                const content = `# Task: Implement ${node.name}

## Status: Todo (Topology Driven)
Generated: ${new Date().toISOString()}

## Metadata
- **Atlas ID:** ${node.id}
- **Type:** ${node.type}
- **Language:** ${lang}
- **Purpose:** ${node.purpose}

## Requirements
- Adhere to the ${node.type} standards for ${lang}.
- Implementation must match Atlas ID: \`${node.id}\`.

## Structural Proof (Atlas)
- [x] Registered in planned.json
- [ ] Verified by Atlas Scanner`;
                await fs_extra_1.default.ensureDir(path_1.default.join(PIPELINE_ROOT, '01_todo'));
                await fs_extra_1.default.writeFile(path_1.default.join(PIPELINE_ROOT, '01_todo', taskId), content);
                console.log(`  + Created: ${taskId} (${node.id})`);
            }
        }
    }
}
exports.PipelineManager = PipelineManager;
// Simple CLI Interface
const [, , cmd, ...args] = process.argv;
async function run() {
    try {
        switch (cmd) {
            case 'list':
                await PipelineManager.list();
                break;
            case 'create':
                await PipelineManager.create(args[0]);
                break;
            case 'sync':
                await PipelineManager.sync();
                break;
            case 'start':
                await PipelineManager.move(args[0], '02_in_progress');
                break;
            case 'review':
                await PipelineManager.move(args[0], '03_review');
                break;
            case 'complete':
                await PipelineManager.move(args[0], '04_completed');
                break;
            case 'todo':
                await PipelineManager.move(args[0], '01_todo');
                break;
            // --- TOPOLOGY PLANNING (WRITE) ---
            case 'plan:node':
                await TopologyPlanner.upsertNode(args[0], args[1], args[2], args[3]);
                break;
            case 'plan:guard':
                await TopologyPlanner.setGuard(args[0], args[1], args[2]);
                break;
            case 'plan:authority':
                await TopologyPlanner.setAuthority(args[0], args[1] === 'true');
                break;
            // --- TOPOLOGY QUERY (READ) ---
            case 'plan:get':
                await TopologyPlanner.getNode(args[0]);
                break;
            case 'plan:list':
                await TopologyPlanner.listNodes(args[0]);
                break;
            case 'plan:find':
                await TopologyPlanner.findNodes(args[0]);
                break;
            default:
                console.log('Usage: pipeline [list|create|sync|todo|start|review|complete]');
                console.log('       pipeline plan:node <id> <name> <type> <purpose>');
                console.log('       pipeline plan:guard <id> <authorityId> <guarded|restricted|none>');
                console.log('       pipeline plan:authority <id> <true|false>');
                console.log('       pipeline plan:get <id>');
                console.log('       pipeline plan:list [filterType]');
                console.log('       pipeline plan:find <pattern>');
        }
    }
    catch (e) {
        console.error(`[ERROR] ${e.message}`);
        process.exit(1);
    }
}
run();
