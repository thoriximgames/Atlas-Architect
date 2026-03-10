"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineManager = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const PlannerCore_1 = require("./Shared/PlannerCore");
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
            throw new Error(`Task '${taskId}' not found in any pipeline stage.`);
        if (sourceStage === targetStage)
            return;
        const sourcePath = path_1.default.join(PIPELINE_ROOT, sourceStage, taskId);
        const targetPath = path_1.default.join(PIPELINE_ROOT, targetStage, taskId);
        await fs_extra_1.default.ensureDir(path_1.default.dirname(targetPath));
        await fs_extra_1.default.move(sourcePath, targetPath);
        console.log(`Successfully moved ${taskId} from ${sourceStage} to ${targetStage}`);
    }
    static async create(id, name, purpose) {
        const content = `# Task: Implement Architecture - ${name}

## Status: Todo (Intent Verification)
Generated: ${new Date().toISOString()}

## Metadata
- **Atlas ID:** ${id}
- **Purpose:** ${purpose}

## Structural Proof (Atlas)
- [ ] Registered in plan.json`;
        await fs_extra_1.default.ensureDir(path_1.default.join(PIPELINE_ROOT, '00_backlog'));
        await fs_extra_1.default.writeFile(path_1.default.join(PIPELINE_ROOT, '00_backlog', id), content);
        console.log(`Task created: ${id}`);
    }
    static async hasActiveTasks() {
        const stagesToCheck = ['01_todo', '02_in_progress', '03_review'];
        for (const stage of stagesToCheck) {
            const dir = path_1.default.join(PIPELINE_ROOT, stage);
            if (await fs_extra_1.default.pathExists(dir)) {
                const files = await fs_extra_1.default.readdir(dir);
                if (files.length > 0)
                    return true;
            }
        }
        return false;
    }
    static async getGhostNodes() {
        const realityPath = path_1.default.join(projectRoot, '.atlas/data/reality.json');
        const plannedData = await PlannerCore_1.PlannerCore.loadBlueprint(true);
        let verifiedIds = new Set();
        if (await fs_extra_1.default.pathExists(realityPath)) {
            const realityData = await fs_extra_1.default.readJson(realityPath);
            verifiedIds = new Set(Object.values(realityData.nodes || {}).map((n) => n.id));
        }
        return (plannedData.plannedNodes || []).filter((n) => !verifiedIds.has(n.id));
    }
    static async sync() {
        const realityPath = path_1.default.join(projectRoot, '.atlas/data/reality.json');
        const plannedData = await PlannerCore_1.PlannerCore.loadBlueprint(true);
        let verifiedIds = new Set();
        let realityData = {};
        if (await fs_extra_1.default.pathExists(realityPath)) {
            realityData = await fs_extra_1.default.readJson(realityPath);
            verifiedIds = new Set(Object.values(realityData.nodes || {})
                .map((n) => n.id));
        }
        const ghostNodes = (plannedData.plannedNodes || []).filter((n) => !verifiedIds.has(n.id));
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
- **Physical Hash:** ${node.verifiedHash}

## Required Action
A change has been detected in the physical implementation of this node that violates its verified topological state. 
Please review the changes and either revert them or update the authoritative blueprint.

## Structural Proof (Atlas)
- [ ] Verified by Atlas Scanner`;
                await fs_extra_1.default.ensureDir(path_1.default.join(PIPELINE_ROOT, '01_todo'));
                await fs_extra_1.default.writeFile(path_1.default.join(PIPELINE_ROOT, '01_todo', taskId), content);
                console.log(`  + Created Audit: ${taskId}`);
            }
        }
        for (const node of ghostNodes) {
            const taskId = 'src_' + node.id.replace(/[\/\\]/g, '_').replace(/\./g, '_') + '.md';
            let exists = false;
            for (const stage of STAGES) {
                if (await fs_extra_1.default.pathExists(path_1.default.join(PIPELINE_ROOT, stage, taskId))) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                const content = `# Task: Implement Node - ${node.name}

## Status: Todo (Ghost Node)
Generated: ${new Date().toISOString()}

## Metadata
- **Atlas ID:** ${node.id}
- **Target Parent:** ${node.parentId}
- **Purpose:** ${node.purpose}

## Required Action
This node is registered in the intentional blueprint but has no physical implementation in the codebase. 
Create the corresponding file and implement the logic to satisfy the architectural requirement.

## Structural Proof (Atlas)
- [ ] Registered in plan.json
- [ ] Verified by Atlas Scanner`;
                await fs_extra_1.default.ensureDir(path_1.default.join(PIPELINE_ROOT, '01_todo'));
                await fs_extra_1.default.writeFile(path_1.default.join(PIPELINE_ROOT, '01_todo', taskId), content);
                console.log(`  + Created: ${taskId} (${node.id})`);
            }
        }
    }
}
exports.PipelineManager = PipelineManager;
/**
 * Pipeline CLI Entry Point
 */
if (process.argv[1].includes('pipeline') || process.argv[1].includes('dist/pipeline.js')) {
    const run = async () => {
        const cmd = process.argv[2];
        const args = process.argv.slice(3);
        try {
            switch (cmd) {
                case 'list':
                    await PipelineManager.list();
                    break;
                case 'sync':
                    await PipelineManager.sync();
                    break;
                case 'create':
                    await PipelineManager.create(args[0], args[1], args[2]);
                    break;
                case 'todo':
                    await PipelineManager.move(args[0], '01_todo');
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
    };
    run();
}
