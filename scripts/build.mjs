import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

function runProcess(command, args, cwd) {
    return new Promise((resolve, reject) => {
        // Use shell: true to handle cross-platform executable resolution (e.g. npm vs npm.cmd on Windows)
        const child = spawn(command, args, { cwd, shell: true, stdio: 'inherit' });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command '${command} ${args.join(' ')}' exited with code ${code}`));
            }
        });
        
        child.on('error', (err) => {
            reject(err);
        });
    });
}

function syncSkill(rootDir) {
    console.log('\n--- [3/3] Syncing Atlas Architect Skill to Global Environment ---');
    const homedir = process.env.USERPROFILE || process.env.HOME || '';
    if (!homedir) {
        console.warn('[WARNING] Could not determine user home directory. Skipping skill sync.');
        return;
    }

    const localSkillPath = path.join(rootDir, 'SKILL.md');
    const globalSkillDir = path.join(homedir, '.gemini', 'skills', 'atlas-architect');
    const globalSkillPath = path.join(globalSkillDir, 'SKILL.md');

    if (fs.existsSync(localSkillPath)) {
        if (!fs.existsSync(globalSkillDir)) {
            fs.mkdirSync(globalSkillDir, { recursive: true });
        }
        fs.copyFileSync(localSkillPath, globalSkillPath);
        console.log(`[SUCCESS] Copied SKILL.md to ${globalSkillPath}`);
    } else {
        console.warn(`[WARNING] Local SKILL.md not found at ${localSkillPath}`);
    }
}

async function buildAll() {
    const rootDir = process.cwd();
    const viewerDir = path.join(rootDir, 'viewer');

    try {
        console.log('\n--- [1/3] Building Atlas Backend (tsc) ---');
        // We can run tsc directly if it's globally installed, or use npx/npm run to find the local one
        await runProcess('npm', ['run', 'build:tsc'], rootDir);

        console.log('\n--- [2/3] Building Atlas Viewer (vite) ---');
        // Run npm run build explicitly inside the viewer directory
        await runProcess('npm', ['run', 'build'], viewerDir);
        
        syncSkill(rootDir);

        console.log('\n--- Build Complete ---');
    } catch (e) {
        console.error(`\n[BUILD FAILED] ${e.message}`);
        process.exit(1);
    }
}

buildAll();
