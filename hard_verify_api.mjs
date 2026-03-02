import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

const PLANNED_PATH = 'E:/GIT/MMO-Suite/.atlas/data/planned.json';
const ATLAS_PATH = 'E:/GIT/MMO-Suite/.atlas/data/atlas.json';
const API_URL = 'http://localhost:5056/api/topology/positions';
const TEST_NODE_ID = 'MMO-Server/src/Main';
const TEST_X = 777;
const TEST_Y = 888;

async function hardVerify() {
    console.log('--- STARTING END-TO-END HARD VERIFICATION ---');

    // 1. Test API Connectivity and Persistence
    console.log(`[1/4] Sending POST request to API...`);
    const payload = { [TEST_NODE_ID]: { x: TEST_X, y: TEST_Y } };
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`API returned ${response.status}`);
        console.log('      API Response: OK');
    } catch (e) {
        throw new Error(`API Connection Failed: ${e.message}. Is the server running on 5056?`);
    }

    // 2. Verify planned.json was written
    const planned = await fs.readJson(PLANNED_PATH);
    const pNode = planned.plannedNodes.find(n => n.id === TEST_NODE_ID);
    if (pNode.x === TEST_X && pNode.y === TEST_Y) {
        console.log('[2/4] planned.json verification: SUCCESS');
    } else {
        throw new Error(`planned.json verification: FAILED (Expected ${TEST_X}, found ${pNode.x})`);
    }

    // 3. Run Scan to trigger Registry generation
    console.log('[3/4] Running Atlas Scan to propagate data...');
    execSync('node E:/GIT/MMO-Suite/.atlas/dist/index.js --scan-only', { cwd: 'E:/GIT/MMO-Suite' });

    // 4. Verify atlas.json (The final registry)
    const registry = await fs.readJson(ATLAS_PATH);
    const rNode = registry.nodes[TEST_NODE_ID];
    
    console.log(`      Final Registry Results for ${TEST_NODE_ID}:`);
    console.log(`      initialX: ${rNode.initialX}, initialY: ${rNode.initialY}`);
    console.log(`      x: ${rNode.x}, y: ${rNode.y}`);

    if (rNode.initialX === TEST_X && rNode.initialY === TEST_Y) {
        console.log('\n✅ SYSTEM VERIFIED: Data flow from API -> Disk -> Registry is perfect.');
    } else {
        throw new Error('SYSTEM FAILED: Data reached Disk but was lost during Registry generation.');
    }
}

hardVerify().catch(err => {
    console.error(`\n❌ VERIFICATION FAILED: ${err.message}`);
    process.exit(1);
});
