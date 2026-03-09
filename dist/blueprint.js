"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TopologyPlanner = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
// Context Detection
const cwd = process.cwd();
let projectRoot = cwd;
if (path_1.default.basename(cwd) === '.atlas') {
    projectRoot = path_1.default.resolve(cwd, '..');
}
/**
 * TopologyPlanner: Intentional architecture and evolution manager.
 *
 * DESIGN INTENT:
 * Manages two states of the architecture:
 * 1. Authoritative (blueprint.json): The verified, current structural mandate.
 * 2. Plan (plan.json): The draft board for planning future work.
 *
 * Provides CLI-driven "Merge" to move plan into the authoritative blueprint.
 */
class TopologyPlanner {
    static getBlueprintPath(isPlanMode = false) {
        if (isPlanMode) {
            return path_1.default.join(projectRoot, '.atlas', 'data', 'plan.json');
        }
        return path_1.default.join(projectRoot, 'docs', 'topology', 'blueprint.json');
    }
    static async isLocked() {
        return await fs_extra_1.default.pathExists(this.getBlueprintPath(true));
    }
    static async loadBlueprint(isPlanMode = false) {
        const filePath = this.getBlueprintPath(isPlanMode);
        if (!await fs_extra_1.default.pathExists(filePath)) {
            if (isPlanMode) {
                const authPath = this.getBlueprintPath(false);
                if (await fs_extra_1.default.pathExists(authPath)) {
                    await fs_extra_1.default.copy(authPath, filePath);
                    return await fs_extra_1.default.readJson(filePath);
                }
            }
            return { plannedNodes: [] };
        }
        return await fs_extra_1.default.readJson(filePath);
    }
    static async saveBlueprint(data, isPlanMode = false, skipLockCheck = false) {
        if (!isPlanMode && !skipLockCheck) {
            if (await this.isLocked()) {
                throw new Error("AUTHORITY LOCK: The Blueprint is currently locked by an active Plan. Merging the plan or aborting it is required to modify the Blueprint directly.");
            }
        }
        const filePath = this.getBlueprintPath(isPlanMode);
        await fs_extra_1.default.ensureDir(path_1.default.dirname(filePath));
        await fs_extra_1.default.writeJson(filePath, data, { spaces: 2 });
        console.log(`[PLANNER] Updated ${isPlanMode ? 'Active Plan' : 'Authoritative Blueprint'}`);
    }
    static async promote() {
        const planPath = this.getBlueprintPath(true);
        const authPath = this.getBlueprintPath(false);
        if (!await fs_extra_1.default.pathExists(planPath)) {
            throw new Error("No active plan data found to merge.");
        }
        await fs_extra_1.default.copy(planPath, authPath);
        await fs_extra_1.default.remove(planPath); // Release the lock
        console.log(`[PLANNER] SUCCESS: Plan has been merged into the Authoritative Blueprint. Lock released.`);
    }
    static async upsertNode(id, name, type, purpose, parentId, isPlanMode = false) {
        await this.upsertNodes([{ id, name, type, purpose, parentId }], isPlanMode);
    }
    static async upsertNodes(nodes, isPlanMode = false) {
        const data = await this.loadBlueprint(isPlanMode);
        for (const input of nodes) {
            let node = data.plannedNodes.find((n) => n.id === input.id);
            if (node) {
                node.name = input.name;
                node.type = input.type;
                node.purpose = input.purpose;
                if (input.parentId !== undefined)
                    node.parentId = input.parentId;
                if (input.description !== undefined)
                    node.description = input.description;
                if (input.designIntent !== undefined)
                    node.designIntent = input.designIntent;
                console.log(`[PLANNER] Updated node: ${input.id}`);
            }
            else {
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
    static async setNodeProperty(id, property, value, isPlanMode = false) {
        const data = await this.loadBlueprint(isPlanMode);
        let node = data.plannedNodes.find((n) => n.id === id);
        if (!node)
            throw new Error(`Node ${id} not found in ${isPlanMode ? 'plan' : 'authoritative'} blueprint`);
        switch (property) {
            case 'name':
                node.name = value;
                break;
            case 'type':
                node.type = value;
                break;
            case 'purpose':
                node.purpose = value;
                break;
            case 'parentId':
                node.parentId = value;
                break;
            case 'description':
                node.description = value;
                break;
            case 'designIntent':
                node.designIntent = value;
                break;
            case 'x':
                node.x = parseFloat(value);
                break;
            case 'y':
                node.y = parseFloat(value);
                break;
            default:
                throw new Error(`Unsupported property '${property}'`);
        }
        await this.saveBlueprint(data, isPlanMode);
        console.log(`[PLANNER] SUCCESS: Updated ${property} for '${id}'`);
    }
    static async removeNode(id, isPlanMode = false) {
        const data = await this.loadBlueprint(isPlanMode);
        data.plannedNodes = data.plannedNodes.filter((n) => n.id !== id);
        await this.saveBlueprint(data, isPlanMode);
        console.log(`[PLANNER] Removed node: ${id}`);
    }
    static async getNode(id, isPlanMode = false) {
        const data = await this.loadBlueprint(isPlanMode);
        const node = data.plannedNodes.find((n) => n.id === id);
        if (node)
            console.log(JSON.stringify(node, null, 2));
        else
            console.log(`[QUERY] Node '${id}' not found.`);
    }
    static async heal(realityNodes, isPlanMode = false) {
        const data = await this.loadBlueprint(isPlanMode);
        let modified = false;
        for (const pn of data.plannedNodes) {
            const rn = realityNodes[pn.id];
            if (rn) {
                if (!pn.name || pn.name === pn.id) {
                    pn.name = rn.name;
                    modified = true;
                }
                if (!pn.type || pn.type === 'Unknown') {
                    pn.type = rn.type;
                    modified = true;
                }
                if (rn.description && rn.description !== pn.description) {
                    pn.description = rn.description;
                    modified = true;
                }
            }
        }
        if (modified)
            await this.saveBlueprint(data, isPlanMode);
        return data;
    }
}
exports.TopologyPlanner = TopologyPlanner;
