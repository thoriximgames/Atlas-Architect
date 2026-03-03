import fs from 'fs-extra';
import path from 'path';
import { execSync, spawn } from 'child_process';
import os from 'os';

async function broadcast() {
    console.log('[Broadcast] Step 1: Rebuilding core Atlas Engine & Viewer...');
    try {
        execSync('npm run build', { stdio: 'inherit' });
        execSync('npm run build', { cwd: './viewer', stdio: 'inherit' });
    } catch (e) {
        console.error('[Broadcast] Build failed. Aborting broadcast.');
        process.exit(1);
    }

    console.log('[Broadcast] Step 2: Reading global registry...');
    const registryDir = path.join(os.homedir(), '.gemini');
    const registryPath = path.join(registryDir, 'atlas_sessions.json');

    if (!await fs.pathExists(registryPath)) {
        console.log('[Broadcast] No active sessions found. Done.');
        return;
    }

    const sessions = await fs.readJson(registryPath);
    const globalScript = path.join(process.cwd(), 'scripts', 'Start-Atlas.ps1');
    
    console.log('[Broadcast] Step 3: Pushing updates to active projects...');
    for (const key in sessions) {
        const session = sessions[key];
        if (session.path) {
            console.log(`[Broadcast] -> Restarting project: ${session.project} at ${session.path}`);
            try {
                execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${globalScript}" -Target "${session.path}"`, { stdio: 'inherit' });
            } catch (e) {
                console.error(`[Broadcast] -> Failed to restart ${session.project}.`);
            }
        } else {
            console.log(`[Broadcast] -> Skipping ${session.project} (No path data saved yet).`);
        }
    }
    
    console.log('[Broadcast] Broadcast complete. All valid sessions updated.');
}

broadcast();