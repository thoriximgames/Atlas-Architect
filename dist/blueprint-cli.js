"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const blueprint_1 = require("./blueprint");
const run = async () => {
    // Strip --target completely to prevent it from bleeding into node strings
    const rawArgs = process.argv.slice(2);
    const targetIdx = rawArgs.indexOf('--target');
    if (targetIdx !== -1) {
        rawArgs.splice(targetIdx, 2);
    }
    const cmd = rawArgs[0];
    const args = rawArgs.slice(1);
    try {
        if (cmd === 'blueprint') {
            // Read-only or authoritative commands
            const subCmd = args[0];
            if (subCmd === 'list') {
                const data = await blueprint_1.TopologyPlanner.loadBlueprint(false);
                console.log(JSON.stringify(data.plannedNodes, null, 2));
            }
            else {
                console.log('Usage: blueprint list');
            }
            return;
        }
        // Planning mode commands
        const isPlanMode = true;
        switch (cmd) {
            case 'start':
                const authData = await blueprint_1.TopologyPlanner.loadBlueprint(false);
                await blueprint_1.TopologyPlanner.saveBlueprint(authData, true);
                console.log('[PLANNER] Started new planning session. Copied blueprint to active plan.');
                break;
            case 'merge':
                await blueprint_1.TopologyPlanner.promote();
                break;
            case 'add':
                await blueprint_1.TopologyPlanner.upsertNode(args[0], args[1], args[2], args[3], args[4], isPlanMode);
                break;
            case 'set':
                await blueprint_1.TopologyPlanner.setNodeProperty(args[0], args[1], args.slice(2).join(' '), isPlanMode);
                break;
            case 'remove':
                await blueprint_1.TopologyPlanner.removeNode(args[0], isPlanMode);
                break;
            case 'get':
                await blueprint_1.TopologyPlanner.getNode(args[0], isPlanMode);
                break;
            default:
                if (cmd) {
                    console.log('Usage: plan [start|add|set|remove|get|merge]');
                }
        }
    }
    catch (e) {
        console.error(`[ERROR] ${e.message}`);
        process.exit(1);
    }
};
run();
