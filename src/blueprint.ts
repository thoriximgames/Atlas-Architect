import fs from 'fs-extra';
import path from 'path';
import { NodeType, GuardState } from './Shared/Protocol';

// Context Detection
const cwd = process.cwd();
let projectRoot = cwd;
if (path.basename(cwd) === '.atlas') {
    projectRoot = path.resolve(cwd, '..');
}

const PLANNED_PATH = path.join(projectRoot, 'docs/topology/planned.json');

export class TopologyPlanner {
    static async loadPlanned() {
        if (!await fs.pathExists(PLANNED_PATH)) {
            console.log(`[DEBUG] Planned path not found: ${PLANNED_PATH}`);
            return { plannedNodes: [] };
        }
        const data = await fs.readJson(PLANNED_PATH);
        console.log(`[DEBUG] Loaded raw data type: ${Array.isArray(data) ? 'Array' : typeof data}`);
        if (Array.isArray(data)) {
            console.log(`[DEBUG] Returning wrapped array with ${data.length} nodes`);
            return { plannedNodes: data };
        }
        console.log(`[DEBUG] Returning object with ${(data.plannedNodes || []).length} nodes`);
        return data;
    }

    static async savePlanned(data: any) {
        // ALWAYS save as wrapped object to ensure stability across commands.
        // If data is already an array (due to legacy read), wrap it.
        const output = Array.isArray(data) ? { plannedNodes: data } : data;
        
        await fs.writeJson(PLANNED_PATH, output, { spaces: 2 });
        console.log(`[PLANNER] Updated ${PLANNED_PATH}`);
    }

    static async upsertNode(id: string, name: string, type: NodeType, purpose: string, parentId?: string) {
        await this.upsertNodes([{ id, name, type, purpose, parentId }]);
    }

    static async upsertNodes(nodes: { id: string, name: string, type: NodeType, purpose: string, parentId?: string }[]) {
        const data = await this.loadPlanned();
        
        for (const input of nodes) {
            let node = data.plannedNodes.find((n: any) => n.id === input.id);
            
            if (node) {
                node.name = input.name;
                node.type = input.type;
                node.purpose = input.purpose;
                if (input.parentId) node.parentId = input.parentId;
                console.log(`[PLANNER] Updated node: ${input.id}`);
            } else {
                data.plannedNodes.push({
                    id: input.id, 
                    name: input.name, 
                    type: input.type, 
                    purpose: input.purpose,
                    parentId: input.parentId || "",
                    dependencies: [],
                    description: ""
                });
                console.log(`[PLANNER] Added new node: ${input.id}`);
            }
        }
        await this.savePlanned(data);
    }

    static async heal(realityNodes: Record<string, any>) {
        const data = await this.loadPlanned();
        let modified = false;

        for (const pn of data.plannedNodes) {
            const rn = realityNodes[pn.id];
            if (rn) {
                // Heal Name if unknown or raw ID
                if (!pn.name || pn.name === pn.id || pn.name === 'Unknown' || pn.name.includes('/')) {
                    if (rn.name && rn.name !== pn.name) {
                        console.log(`[PLANNER] Healing Name for ${pn.id}: ${pn.name} -> ${rn.name}`);
                        pn.name = rn.name;
                        modified = true;
                    }
                }
                // Heal Type if unknown
                if (!pn.type || pn.type === 'Unknown') {
                    if (rn.type && rn.type !== 'Unknown') {
                        console.log(`[PLANNER] Healing Type for ${pn.id}: Unknown -> ${rn.type}`);
                        pn.type = rn.type;
                        modified = true;
                    }
                }
            }
        }

        if (modified) {
            await this.savePlanned(data);
        }
        return data;
    }

    static async branch(parentId: string, children: string[]) {
        const data = await this.loadPlanned();
        for (const def of children) {
            const parts = def.split('|');
            const id = parts[0];
            const name = parts[1];
            const type = parts[2] as NodeType;
            const purpose = parts[3];

            if (!id || !name || !type) {
                console.error(`[ERROR] Invalid child definition: ${def}.`);
                continue;
            }

            let node = data.plannedNodes.find((n: any) => n.id === id);
            if (node) {
                node.name = name;
                node.type = type;
                node.purpose = purpose;
                node.parentId = parentId;
            } else {
                data.plannedNodes.push({
                    id, name, type, purpose: purpose || "",
                    parentId: parentId,
                    dependencies: [],
                    description: ""
                });
            }
        }
        await this.savePlanned(data);
        console.log(`[PLANNER] Branch created under ${parentId} (${children.length} nodes).`);
    }

    static async setGuard(id: string, authorityId: string, state: GuardState) {
        const data = await this.loadPlanned();
        let node = data.plannedNodes.find((n: any) => n.id === id);
        if (!node) throw new Error(`Node ${id} not found in planned.json`);

        node.authorityId = authorityId;
        node.guardState = state;
        await this.savePlanned(data);
        console.log(`[PLANNER] Set Guard: ${id} is now ${state} by ${authorityId}`);
    }

    static async setAuthority(id: string, isAuthority: boolean) {
        const data = await this.loadPlanned();
        let node = data.plannedNodes.find((n: any) => n.id === id);
        if (!node) throw new Error(`Node ${id} not found in planned.json`);

        node.isAuthority = isAuthority;
        await this.savePlanned(data);
        console.log(`[PLANNER] Set Authority: ${id} isAuthority = ${isAuthority}`);
    }

    static async removeNode(id: string) {
        const data = await this.loadPlanned();
        const initialLength = data.plannedNodes.length;
        data.plannedNodes = data.plannedNodes.filter((n: any) => n.id !== id);
        
        if (data.plannedNodes.length < initialLength) {
            await this.savePlanned(data);
            console.log(`[PLANNER] Removed node: ${id}`);
        } else {
            console.log(`[PLANNER] Node not found, nothing removed: ${id}`);
        }
    }

    static async getNode(id: string) {
        const data = await this.loadPlanned();
        const node = data.plannedNodes.find((n: any) => n.id === id);
        if (node) {
            console.log(JSON.stringify(node, null, 2));
        } else {
            console.log(`[QUERY] Node '${id}' not found.`);
        }
    }

    static async listNodes(filterType?: string) {
        const data = await this.loadPlanned();
        console.log(`[DEBUG] listNodes: raw plannedNodes length: ${data.plannedNodes?.length}`);
        
        const filtered = filterType 
            ? data.plannedNodes.filter((n: any) => n.type === filterType)
            : data.plannedNodes;
        
        console.log(`[DEBUG] listNodes: filtered length: ${filtered?.length}`);
        
        console.log(`\n--- PLANNED NODES (${(filtered || []).length}) ---`);
        if (filtered) {
            filtered.forEach((n: any) => {
                console.log(`[${n.type.padEnd(10)}] ${n.id}`);
            });
        }
    }

    static async findNodes(pattern: string) {
        const data = await this.loadPlanned();
        const regex = new RegExp(pattern, 'i');
        const results = data.plannedNodes.filter((n: any) => 
            regex.test(n.id) || regex.test(n.name) || regex.test(n.purpose || "")
        );

        console.log(`\n--- SEARCH RESULTS FOR '${pattern}' (${results.length}) ---`);
        results.forEach((n: any) => {
            console.log(`[${n.type.padEnd(10)}] ${n.id} (${n.name})`);
        });
    }
}

// Simple CLI Interface for Blueprint Commands
if (typeof require !== 'undefined' && require.main === module) {
    const rawArgs = process.argv.slice(2);
    // Filter out --target flag and its value
    const targetIdx = rawArgs.indexOf('--target');
    const filteredArgs = rawArgs.filter((_, i) => i !== targetIdx && i !== targetIdx + 1);
    
    const [cmd, ...args] = filteredArgs;

    async function run() {
        try {
            switch (cmd) {
                case 'add': 
                    await TopologyPlanner.upsertNode(args[0], args[1], args[2] as NodeType, args[3], args[4]); 
                    break;
                case 'branch':
                    await TopologyPlanner.branch(args[0], args.slice(1));
                    break;
                case 'guard': 
                    await TopologyPlanner.setGuard(args[0], args[1], args[2] as GuardState); 
                    break;
                case 'authority': 
                    await TopologyPlanner.setAuthority(args[0], args[1] === 'true'); 
                    break;
                case 'remove':
                    await TopologyPlanner.removeNode(args[0]);
                    break;
                case 'get':
                    await TopologyPlanner.getNode(args[0]);
                    break;
                case 'list':
                    await TopologyPlanner.listNodes(args[0]);
                    break;
                case 'find':
                    await TopologyPlanner.findNodes(args[0]);
                    break;

                default: 
                    if (cmd) {
                        console.log('Usage: blueprint [add|branch|guard|authority|get|list|find]');
                        console.log('       blueprint add <id> <name> <type> <purpose> [parentId]');
                        console.log('       blueprint branch <parentId> <id|name|type|purpose>...');
                        console.log('       blueprint guard <id> <authorityId> <guarded|restricted|none>');
                        console.log('       blueprint authority <id> <true|false>');
                        console.log('       blueprint get <id>');
                        console.log('       blueprint list [filterType]');
                        console.log('       blueprint find <pattern>');
                    }
            }
        } catch (e: any) {
            console.error(`[ERROR] ${e.message}`);
            process.exit(1);
        }
    }

    run();
}
