import glob from 'fast-glob';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
export class FileSystemScanner {
    exclude = [
        '**/bin/**', '**/obj/**', '**/*.meta', '**/*.asmdef', '**/node_modules/**', '**/.git/**',
        '**/Vendor/**', '**/Generated/**', '**/build/**', '**/CMakeFiles/**', '**/_deps/**'
    ];
    async scan(root) {
        const patterns = [
            path.join(root, 'MMO-Server/src/**/*.{cpp,h,cs}').replace(/\\/g, '/'),
            path.join(root, 'MMO-Client/Assets/**/*.{cs}').replace(/\\/g, '/')
        ];
        const files = await glob(patterns, { ignore: this.exclude });
        const results = await Promise.all(files.map(f => this.parse(f, root)));
        // Use a map to merge .h, .cpp, etc. by their ID
        const merged = new Map();
        for (const res of results) {
            const existing = merged.get(res.id);
            if (existing) {
                existing.dependencies = Array.from(new Set([...existing.dependencies, ...res.dependencies]));
                existing.baseClasses = Array.from(new Set([...existing.baseClasses, ...res.baseClasses]));
                // Keep the most descriptive name/type if possible
                if (existing.type === 'Unknown' && res.type !== 'Unknown')
                    existing.type = res.type;
                // If one has no file extension in ID, prefer that, but here IDs are already extension-less
            }
            else {
                merged.set(res.id, res);
            }
        }
        return Array.from(merged.values());
    }
    async parse(file, root) {
        const content = await fs.readFile(file, 'utf8');
        const ext = path.extname(file);
        const name = path.basename(file, ext);
        const rel = path.relative(root, file).replace(/\\/g, '/');
        return {
            id: rel.replace(ext, ''),
            name,
            filePath: rel,
            type: this.getType(name, rel, content),
            dependencies: this.getDeps(content, ext, name),
            baseClasses: this.getBases(content, ext),
            hash: crypto.createHash('md5').update(content).digest('hex')
        };
    }
    getType(name, rel, content) {
        const low = rel.toLowerCase();
        const lowName = name.toLowerCase();
        if (content.includes('interface ' + name) || name.startsWith('I') && /[A-Z]/.test(name[1]))
            return 'Interface';
        if (low.includes('/systems/') || lowName.endsWith('system') || lowName.endsWith('manager'))
            return 'System';
        if (low.includes('/services/') || lowName.endsWith('service') || lowName.endsWith('worker'))
            return 'Service';
        if (low.includes('/engine/') || low.includes('/core/') || low.includes('/host/'))
            return 'System';
        if (low.includes('/components/') || lowName.endsWith('component') || lowName.endsWith('module'))
            return 'Component';
        if (low.includes('/data/') || lowName.endsWith('template') || lowName.endsWith('dto') || lowName.endsWith('repository'))
            return 'DTO';
        return 'Unknown';
    }
    getDeps(content, ext, name) {
        const deps = new Set();
        if (ext === '.cs') {
            const matches = content.matchAll(/using\s+([\w\.]+);/g);
            for (const m of matches) {
                const d = m[1].split('.').pop();
                if (d && d !== 'System')
                    deps.add(d);
            }
            const calls = content.matchAll(/(\w+)\.\w+\(/g);
            for (const c of calls)
                if (c[1] && c[1] !== name)
                    deps.add(c[1]);
        }
        else {
            const includes = content.matchAll(/#include\s+["<]([\w\/\.]+)[">]/g);
            for (const i of includes)
                deps.add(path.basename(i[1], path.extname(i[1])));
        }
        return Array.from(deps);
    }
    getBases(content, ext) {
        if (ext !== '.cs')
            return [];
        const match = content.match(/(?:class|interface)\s+\w+\s*:\s*([^{]+)/);
        return match ? match[1].split(',').map(s => s.trim().split('.').pop()) : [];
    }
}
