import { TopologyPlanner } from './blueprint';
import { NodeType } from './Shared/Protocol';

const run = async () => {
    const cmd = process.argv[2];
    const args = process.argv.slice(3);

    // Detect --stage flag
    let isStaging = false;
    const stageIdx = args.indexOf('--stage');
    if (stageIdx !== -1) {
        isStaging = true;
        args.splice(stageIdx, 1);
    }

    try {
        switch (cmd) {
            case 'promote':
                await TopologyPlanner.promote();
                break;
            case 'add':
                await TopologyPlanner.upsertNode(args[0], args[1], args[2] as NodeType, args[3], args[4], isStaging);
                break;
            case 'set':
                await TopologyPlanner.setNodeProperty(args[0], args[1], args.slice(2).join(' '), isStaging);
                break;
            case 'remove':
                await TopologyPlanner.removeNode(args[0], isStaging);
                break;
            case 'get':
                await TopologyPlanner.getNode(args[0], isStaging);
                break;
            default: 
                if (cmd) {
                    console.log('Usage: blueprint [add|set|remove|get|promote] [--stage]');
                }
        }
    } catch (e: any) {
        console.error(`[ERROR] ${e.message}`);
        process.exit(1);
    }
}
run();
