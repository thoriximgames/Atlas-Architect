import fs from 'fs-extra';
import path from 'path';
import { NodeType, GuardState } from './Shared/Protocol';

// Context Detection
const cwd = process.cwd();
let projectRoot = cwd;
if (path.basename(cwd) === '.atlas') {
    projectRoot = path.resolve(cwd, '..');
}

/**
 * TopologyPlanner: Intentional architecture and evolution manager.
 * 
 * DESIGN INTENT:
 * Manages two states of the architecture:
 * 1. Authoritative (planned.json): The verified, current structural mandate.
 * 2. Staging (staging.json): The draft board for planning future refactors.
 * 
 * Provides CLI-driven "Promotion" to move staging into the authoritative blueprint.
 */
export class TopologyPlanner {
    static getBlueprintPath(isStaging: boolean = false): string {
        if (isStaging) {
            return path.join(projectRoot, '.atlas', 'data', 'staging.json');
        }
        return path.join(projectRoot, 'docs', 'topology', 'planned.json');
    }

    static async loadBlueprint(isStaging: boolean = false) {
        const filePath = this.getBlueprintPath(isStaging);
        if (!await fs.pathExists(filePath)) {
            // If staging is missing, initialize it from authoritative
            if (isStaging) {
                const authPath = this.getBlueprintPath(false);
                if (await fs.pathExists(authPath)) {
                    await fs.copy(authPath, filePath);
                    return await fs.readJson(filePath);
                }
            }
            return { plannedNodes: [] };
        }
        return await fs.readJson(filePath);
    }

    static async saveBlueprint(data: any, isStaging: boolean = false) {
        const filePath = this.getBlueprintPath(isStaging);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, data, { spaces: 2 });
        console.log(`[PLANNER] Updated ${isStaging ? 'Planning Board' : 'Authoritative Blueprint'}`);
    }

    static async promote() {
        const stagingPath = this.getBlueprintPath(true);
        const authPath = this.getBlueprintPath(false);
        if (!await fs.pathExists(stagingPath)) {
            throw new Error("No staging data found to promote.");
        }
        await fs.copy(stagingPath, authPath);
        console.log(`[PLANNER] SUCCESS: Staging has been promoted to the Authoritative Blueprint.`);
    }

    static async upsertNode(id: string, name: string, type: NodeType, purpose: string, parentId?: string, isStaging: boolean = false) {
        await this.upsertNodes([{ id, name, type, purpose, parentId }], isStaging);
    }

    static async upsertNodes(nodes: { id: string, name: string, type: NodeType, purpose: string, parentId?: string, description?: string, designIntent?: string }[], isStaging: boolean = false) {
        const data = await this.loadBlueprint(isStaging);
        
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
        await this.saveBlueprint(data, isStaging);
    }

    static async setNodeProperty(id: string, property: string, value: string, isStaging: boolean = false) {
        const data = await this.loadBlueprint(isStaging);
        let node = data.plannedNodes.find((n: any) => n.id === id);
        if (!node) throw new Error(`Node ${id} not found in ${isStaging ? 'staging' : 'authoritative'} blueprint`);

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

        await this.saveBlueprint(data, isStaging);
        console.log(`[PLANNER] SUCCESS: Updated ${property} for '${id}'`);
    }

    static async removeNode(id: string, isStaging: boolean = false) {
        const data = await this.loadBlueprint(isStaging);
        data.plannedNodes = data.plannedNodes.filter((n: any) => n.id !== id);
        await this.saveBlueprint(data, isStaging);
        console.log(`[PLANNER] Removed node: ${id}`);
    }

    static async getNode(id: string, isStaging: boolean = false) {
        const data = await this.loadBlueprint(isStaging);
        const node = data.plannedNodes.find((n: any) => n.id === id);
        if (node) console.log(JSON.stringify(node, null, 2));
        else console.log(`[QUERY] Node '${id}' not found.`);
    }

    static async heal(realityNodes: Record<string, any>, isStaging: boolean = false) {
        const data = await this.loadBlueprint(isStaging);
        let modified = false;
        for (const pn of data.plannedNodes) {
            const rn = realityNodes[pn.id];
            if (rn) {
                if (!pn.name || pn.name === pn.id) { pn.name = rn.name; modified = true; }
                if (!pn.type || pn.type === 'Unknown') { pn.type = rn.type; modified = true; }
                if (rn.description && rn.description !== pn.description) { pn.description = rn.description; modified = true; }
            }
        }
        if (modified) await this.saveBlueprint(data, isStaging);
        return data;
    }
}
