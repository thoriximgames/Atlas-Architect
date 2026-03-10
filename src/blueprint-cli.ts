import { TopologyPlanner } from './blueprint';
import { NodeType } from './Shared/Protocol';

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
                const data = await TopologyPlanner.loadBlueprint(false);
                console.log(JSON.stringify(data.plannedNodes, null, 2));
            } else if (['add', 'remove', 'set', 'branch'].includes(subCmd)) {
                console.log(`[ERROR] Direct blueprint mutation is forbidden. Use the planning workflow instead:`);
                console.log(`1. 'node atlas.mjs plan start'`);
                console.log(`2. 'node atlas.mjs plan ${subCmd} ...'`);
                console.log(`3. (Implement your code)`);
                console.log(`4. 'node atlas.mjs plan merge'`);
                process.exit(1);
            } else {
                console.log('Usage: blueprint list');
            }
            return;
        }

        // Planning mode commands
        const isPlanMode = true;

        switch (cmd) {
            case 'start':
                const authData = await TopologyPlanner.loadBlueprint(false);
                await TopologyPlanner.saveBlueprint(authData, true);
                console.log('[PLANNER] Started new planning session. Copied blueprint to active plan.');
                break;
            case 'merge':
                await TopologyPlanner.promote();
                break;
            case 'add':
                await TopologyPlanner.upsertNode(args[0], args[1], args[2] as NodeType, args[3], args[4], isPlanMode);
                break;
            case 'set':
                await TopologyPlanner.setNodeProperty(args[0], args[1], args.slice(2).join(' '), isPlanMode);
                break;
            case 'remove':
                await TopologyPlanner.removeNode(args[0], isPlanMode);
                break;
            case 'get':
                await TopologyPlanner.getNode(args[0], isPlanMode);
                break;
            default: 
                if (cmd) {
                    console.log('Usage: plan [start|add|set|remove|get|merge]');
                }
        }
    } catch (e: any) {
        console.error(`[ERROR] ${e.message}`);
        process.exit(1);
    }
}
run();
