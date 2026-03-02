import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

const PLANNED_PATH = 'E:/GIT/MMO-Suite/.atlas/data/planned.json';
const ATLAS_PATH = 'E:/GIT/MMO-Suite/.atlas/data/atlas.json';
const TEST_NODE_ID = 'MMO-Server/src/Main';
const TEST_X = 1234;
const TEST_Y = 5678;

async function runTest() {
    console.log('--- PERSISTENCE TEST START ---');

    // 1. Inject coordinates into planned.json
    if (!await fs.pathExists(PLANNED_PATH)) throw new Error('planned.json missing');
    const planned = await fs.readJson(PLANNED_PATH);
    const node = planned.plannedNodes.find(n => n.id === TEST_NODE_ID);
    if (!node) throw new Error('Test node not found in planned.json');
    
    node.x = TEST_X;
    node.y = TEST_Y;
    await fs.writeJson(PLANNED_PATH, planned, { spaces: 2 });
    console.log(`[1/3] Injected coordinates (${TEST_X}, ${TEST_Y}) into planned.json`);

    // 2. Trigger Scan
    console.log('[2/3] Running Atlas Scan in MMO-Suite...');
    execSync('node E:/GIT/MMO-Suite/.atlas/dist/index.js --scan-only', { stdio: 'inherit', cwd: 'E:/GIT/MMO-Suite' });

    // 3. Verify in atlas.json
    if (!await fs.pathExists(ATLAS_PATH)) throw new Error('atlas.json missing');
    const registry = await fs.readJson(ATLAS_PATH);
    const result = registry.nodes[TEST_NODE_ID];

    console.log(`[3/3] Checking registry output for ${TEST_NODE_ID}...`);
    console.log(`      Found X: ${result.x}, Y: ${result.y}`);
    console.log(`      Found initialX: ${result.initialX}, initialY: ${result.initialY}`);

    if (result.initialX === TEST_X && result.initialY === TEST_Y) {
        console.log('\n✅ PERSISTENCE VERIFIED: Engine is correctly propagating coordinates.');
    } else {
        console.log('\n❌ PERSISTENCE FAILED: Coordinates were lost or overwritten during scan/layout.');
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
});
