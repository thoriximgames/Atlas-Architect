"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineManager = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const blueprint_1 = require("./blueprint");
/**
 * PipelineManager: Task lifecycle and synchronization state manager.
 *
 * DESIGN INTENT:
 * Provides the "Muscles" of the project management layer. It automates the
 * synchronization between the scanned 'Reality' and the 'Planned' blueprint by
 * generating actionable Markdown tasks for architectural drift or missing implementations.
 *
 * KEY RESPONSIBILITIES:
 * 1. Generates 'Ghost Node' tasks for nodes planned in the blueprint but missing in code.
 * 2. Generates 'Audit' tasks for implementation changes that violate previous verifications.
 * 3. Manages the 5-stage task lifecycle (Backlog -> Todo -> In Progress -> Review -> Completed).
 * 4. Ensures only 1 active task is in progress per the Iron Law.
 */
// Context Detection
const cwd = process.cwd();
let projectRoot = cwd;
if (path_1.default.basename(cwd) === '.atlas') {
    projectRoot = path_1.default.resolve(cwd, '..');
}
const PIPELINE_ROOT = path_1.default.join(projectRoot, 'docs/pipeline');
const PLANNED_PATH = path_1.default.join(projectRoot, 'docs/topology/planned.json');
const STAGES = ['00_backlog', '01_todo', '02_in_progress', '03_review', '04_completed'];
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
        const realityPath = path_1.default.join(projectRoot, '.atlas/data/reality.json');
        if (!await fs_extra_1.default.pathExists(PLANNED_PATH)) {
            console.log("planned.json missing. Run 'atlas blueprint add' first.");
            return;
        }
        const plannedData = await blueprint_1.TopologyPlanner.loadPlanned();
        let verifiedIds = new Set();
        let realityData = {};
        if (await fs_extra_1.default.pathExists(realityPath)) {
            realityData = await fs_extra_1.default.readJson(realityPath);
            verifiedIds = new Set(Object.values(realityData.nodes || {})
                .map((n) => n.id) // Nodes are considered mapped/verified if they exist in reality and plan
            );
        }
        const ghostNodes = (plannedData.plannedNodes || []).filter((n) => !verifiedIds.has(n.id));
        // nodesToAudit might need a different definition now if reality just outputs orphan nodes.
        // For now, if a node is in reality but has a 'dirty' verificationStatus, we audit it.
        const nodesToAudit = Object.values(realityData.nodes || {})
            .filter((n) => n.verificationStatus === 'dirty');
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
if (typeof require !== 'undefined' && require.main === module) {
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
                default:
                    if (cmd) {
                        console.log('Usage: pipeline [list|create|sync|todo|start|review|complete]');
                    }
            }
        }
        catch (e) {
            console.error(`[ERROR] ${e.message}`);
            process.exit(1);
        }
    }
    run();
}
