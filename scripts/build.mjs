import { spawn } from 'child_process';
import path from 'path';

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

async function buildAll() {
    const rootDir = process.cwd();
    const viewerDir = path.join(rootDir, 'viewer');

    try {
        console.log('\n--- [1/2] Building Atlas Backend (tsc) ---');
        // We can run tsc directly if it's globally installed, or use npx/npm run to find the local one
        await runProcess('npm', ['run', 'build:tsc'], rootDir);

        console.log('\n--- [2/2] Building Atlas Viewer (vite) ---');
        // Run npm run build explicitly inside the viewer directory
        await runProcess('npm', ['run', 'build'], viewerDir);

        console.log('\n--- Build Complete ---');
    } catch (e) {
        console.error(`\n[BUILD FAILED] ${e.message}`);
        process.exit(1);
    }
}

buildAll();
