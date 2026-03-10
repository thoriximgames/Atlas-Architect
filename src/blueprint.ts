import fs from 'fs-extra';
import path from 'path';
import { NodeType, GuardState } from './Shared/Protocol';
import { PipelineManager } from './pipeline';
import { PlannerCore } from './Shared/PlannerCore';

// Context Detection
const cwd = process.cwd();
let projectRoot = cwd;
if (path.basename(cwd) === '.atlas') {
    projectRoot = path.resolve(cwd, '..');
}

/**
 * TopologyPlanner: Intentional architecture and evolution manager.
 */
export class TopologyPlanner {
    static async isLocked(): Promise<boolean> {
        return await PlannerCore.isLocked();
    }

    static async loadBlueprint(isPlanMode: boolean = false) {
        return await PlannerCore.loadBlueprint(isPlanMode);
    }

    static async saveBlueprint(data: any, isPlanMode: boolean = false, skipLockCheck: boolean = false) {
        if (!isPlanMode && !skipLockCheck) {
            if (await this.isLocked()) {
                throw new Error("AUTHORITY LOCK: The Blueprint is currently locked by an active Plan. Merging the plan or aborting it is required to modify the Blueprint directly.");
            }
        }
        const filePath = PlannerCore.getBlueprintPath(isPlanMode);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, data, { spaces: 2 });
        console.log(`[PLANNER] Updated ${isPlanMode ? 'Active Plan' : 'Authoritative Blueprint'}`);
    }

    static async promote() {
        const planPath = PlannerCore.getBlueprintPath(true);
        const authPath = PlannerCore.getBlueprintPath(false);
        if (!await fs.pathExists(planPath)) {
            throw new Error("No active plan data found to merge.");
        }

        console.log(`[PLANNER] Running verification pre-merge...`);
        const ghostNodes = await PipelineManager.getGhostNodes();
        if (ghostNodes.length > 0) {
            throw new Error(`MERGE BLOCKED: There are ${ghostNodes.length} Ghost Nodes in the plan that have not been implemented yet. Finish coding them first.`);
        }

        const hasActiveTasks = await PipelineManager.hasActiveTasks();
        if (hasActiveTasks) {
            throw new Error(`MERGE BLOCKED: There are incomplete tasks in the pipeline. All implementation and audit tasks must be moved to '04_completed' before merging.`);
        }

        await fs.copy(planPath, authPath);
        await fs.remove(planPath); // Release the lock
        console.log(`[PLANNER] SUCCESS: Plan has been merged into the Authoritative Blueprint. Lock released.`);
    }

    static async upsertNode(id: string, name: string, type: NodeType, purpose: string, parentId?: string, isPlanMode: boolean = false) {
        await this.upsertNodes([{ id, name, type, purpose, parentId }], isPlanMode);
    }

    static async upsertNodes(nodes: { id: string, name: string, type: NodeType, purpose: string, parentId?: string, description?: string, designIntent?: string }[], isPlanMode: boolean = false) {
        const data = await this.loadBlueprint(isPlanMode);
        for (const input of nodes) {
            let node = data.plannedNodes.find((n: any) => n.id === input.id);
            if (node) {
                node.name = input.name;
                node.type = input.type;
                node.purpose = input.purpose;
                if (input.parentId !== undefined) node.parentId = input.parentId;
                if (input.description !== undefined) node.description = input.description;
                if (input.designIntent !== undefined) node.designIntent = input.designIntent;
                console.log(`[PLANNER] Updated node: ${input.id}`);
            } else {
                data.plannedNodes.push({
                    id: input.id, 
                    name: input.name, 
                    type: input.type, 
                    purpose: input.purpose,
                    parentId: input.parentId || "",
                    dependencies: [],
                    description: input.description || "",
                    designIntent: input.designIntent || ""
                });
                console.log(`[PLANNER] Added new node: ${input.id}`);
            }
        }
        await this.saveBlueprint(data, isPlanMode);
    }

    static async setNodeProperty(id: string, property: string, value: string, isPlanMode: boolean = false) {
        const data = await this.loadBlueprint(isPlanMode);
        let node = data.plannedNodes.find((n: any) => n.id === id);
        if (!node) throw new Error(`Node ${id} not found in ${isPlanMode ? 'plan' : 'authoritative'} blueprint`);

        switch (property) {
            case 'name': node.name = value; break;
            case 'type': node.type = value as NodeType; break;
            case 'purpose': node.purpose = value; break;
            case 'parentId': node.parentId = value; break;
            case 'description': node.description = value; break;
            case 'designIntent': node.designIntent = value; break;
            case 'x': node.x = parseFloat(value); break;
            case 'y': node.y = parseFloat(value); break;
            default:
                throw new Error(`Unsupported property '${property}'`);
        }
        await this.saveBlueprint(data, isPlanMode);
        console.log(`[PLANNER] SUCCESS: Updated ${property} for '${id}'`);
    }

    static async removeNode(id: string, isPlanMode: boolean = false) {
        const data = await this.loadBlueprint(isPlanMode);
        data.plannedNodes = data.plannedNodes.filter((n: any) => n.id !== id);
        await this.saveBlueprint(data, isPlanMode);
        console.log(`[PLANNER] Removed node: ${id}`);
    }

    static async getNode(id: string, isPlanMode: boolean = false) {
        const data = await this.loadBlueprint(isPlanMode);
        const node = data.plannedNodes.find((n: any) => n.id === id);
        if (node) console.log(JSON.stringify(node, null, 2));
        else console.log(`[QUERY] Node '${id}' not found.`);
    }

    static async heal(realityNodes: Record<string, any>, isPlanMode: boolean = false) {
        const data = await this.loadBlueprint(isPlanMode);
        let modified = false;
        for (const pn of data.plannedNodes) {
            const rn = realityNodes[pn.id];
            if (rn) {
                if (!pn.name || pn.name === pn.id) { pn.name = rn.name; modified = true; }
                if (!pn.type || pn.type === 'Unknown') { pn.type = rn.type; modified = true; }
                if (rn.description && rn.description !== pn.description) { pn.description = rn.description; modified = true; }
            }
        }
        if (modified) await this.saveBlueprint(data, isPlanMode);
        return data;
    }
}
