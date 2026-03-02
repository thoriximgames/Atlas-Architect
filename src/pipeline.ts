import fs from 'fs-extra';
import path from 'path';

// Context Detection
const cwd = process.cwd();
let projectRoot = cwd;
if (path.basename(cwd) === '.atlas') {
    projectRoot = path.resolve(cwd, '..');
}

const PIPELINE_ROOT = path.join(projectRoot, 'docs/pipeline');
const STAGES = ['00_backlog', '01_todo', '02_in_progress', '03_review', '04_completed'];

export class PipelineManager {
    static async list() {
        console.log('\n--- CURRENT PIPELINE STATE ---');
        for (const stage of STAGES) {
            const dir = path.join(PIPELINE_ROOT, stage);
            if (!await fs.pathExists(dir)) {
                console.log(`[${stage.toUpperCase()}]: Directory not found`);
                continue;
            }
            const files = await fs.readdir(dir);
            console.log(`[${stage.toUpperCase()}]: ${files.length} tasks`);
            files.forEach(f => console.log(`  - ${f}`));
        }
    }

    static async move(taskId: string, targetStage: string) {
        // Find current location
        let sourceStage = '';
        for (const stage of STAGES) {
            if (await fs.pathExists(path.join(PIPELINE_ROOT, stage, taskId))) {
                sourceStage = stage;
                break;
            }
        }

        if (!sourceStage) throw new Error(`Task ${taskId} not found in any stage.`);

        const sourcePath = path.join(PIPELINE_ROOT, sourceStage, taskId);
        const targetPath = path.join(PIPELINE_ROOT, targetStage, taskId);

        // ENFORCEMENT: 1 Active Task Limit
        if (targetStage === '02_in_progress') {
            const inProgressDir = path.join(PIPELINE_ROOT, '02_in_progress');
            const activeTasks = await fs.readdir(inProgressDir);
            if (activeTasks.length > 0) {
                throw new Error(`CRITICAL: Pipeline Overload. Task '${activeTasks[0]}' is already in progress. Finish it first.`);
            }
        }

        await fs.move(sourcePath, targetPath);
        console.log(`Successfully moved ${taskId} from ${sourceStage} to ${targetStage}`);
    }

    static async create(title: string) {
        const id = title.toLowerCase().replace(/\s+/g, '_') + '.md';
        const content = `# Task: ${title}

## Status: Backlog
Created: ${new Date().toISOString()}

## Requirements
- TBD

## Structural Proof (Atlas)
- [ ] Registered in planned.json`;
        await fs.ensureDir(path.join(PIPELINE_ROOT, '00_backlog'));
        await fs.writeFile(path.join(PIPELINE_ROOT, '00_backlog', id), content);
        console.log(`Task created: ${id}`);
    }

    static async sync() {
        const plannedPath = path.join(projectRoot, '.atlas/data/planned.json');
        const atlasPath = path.join(projectRoot, '.atlas/data/atlas.json');

        if (!await fs.pathExists(plannedPath)) {
            console.log("planned.json missing. Run 'atlas scan' first.");
            return;
        }

        const plannedData = await fs.readJson(plannedPath);
        
        // Load atlas data if it exists to check verification status
        let verifiedIds = new Set<string>();
        let atlasData: any = {};
        if (await fs.pathExists(atlasPath)) {
            atlasData = await fs.readJson(atlasPath);
            verifiedIds = new Set(
                Object.values(atlasData.nodes || {})
                    .filter((n: any) => n.status === 'verified')
                    .map((n: any) => n.id)
            );
        }

        const ghostNodes = (plannedData.plannedNodes || []).filter((n: any) => !verifiedIds.has(n.id));
        
        // Find nodes needing architectural audit
        const nodesToAudit = Object.values(atlasData.nodes || {})
            .filter((n: any) => n.status === 'verified' && n.verificationStatus !== 'verified');

        console.log(`[SYNC] Found ${ghostNodes.length} Ghost Nodes and ${nodesToAudit.length} nodes needing audit.`);

        // Generate Audit Tasks
        for (const node of nodesToAudit as any[]) {
            const taskId = 'audit_' + node.id.replace(/[\/\\]/g, '_').replace(/\./g, '_') + '.md';
            
            let exists = false;
            for (const stage of STAGES) {
                if (await fs.pathExists(path.join(PIPELINE_ROOT, stage, taskId))) {
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

                await fs.ensureDir(path.join(PIPELINE_ROOT, '01_todo'));
                await fs.writeFile(path.join(PIPELINE_ROOT, '01_todo', taskId), content);
                console.log(`  + Created Audit: ${taskId}`);
            }
        }

        // Generate Implementation Tasks
        for (const node of ghostNodes) {
            const taskId = node.id.replace(/[\/\\]/g, '_').replace(/\./g, '_') + '.md';
            
            // Check if task exists in any stage
            let exists = false;
            for (const stage of STAGES) {
                if (await fs.pathExists(path.join(PIPELINE_ROOT, stage, taskId))) {
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

                await fs.ensureDir(path.join(PIPELINE_ROOT, '01_todo'));
                await fs.writeFile(path.join(PIPELINE_ROOT, '01_todo', taskId), content);
                console.log(`  + Created: ${taskId} (${node.id})`);
            }
        }
    }
}

// Simple CLI Interface
const [,, cmd, arg1, arg2] = process.argv;

async function run() {
    try {
        switch (cmd) {
            case 'list': await PipelineManager.list(); break;
            case 'create': await PipelineManager.create(arg1); break;
            case 'sync': await PipelineManager.sync(); break;
            case 'start': await PipelineManager.move(arg1, '02_in_progress'); break;
            case 'review': await PipelineManager.move(arg1, '03_review'); break;
            case 'complete': await PipelineManager.move(arg1, '04_completed'); break;
            case 'todo': await PipelineManager.move(arg1, '01_todo'); break;
            default: console.log('Usage: pipeline [list|create|sync|todo|start|review|complete]');
        }
    } catch (e: any) {
        console.error(e.message);
        process.exit(1);
    }
}

run();
