import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
export class BaseParser {
    async parse(filePath, root) {
        const content = await fs.readFile(filePath, 'utf8');
        const ext = path.extname(filePath);
        const name = path.basename(filePath, ext);
        const rel = path.relative(root, filePath).replace(/\\/g, '/');
        return {
            id: rel.replace(ext, ''),
            name,
            filePath: rel,
            type: this.determineType(name, rel, content),
            dependencies: this.extractDependencies(content, name),
            baseClasses: this.extractBaseClasses(content),
            hash: crypto.createHash('md5').update(content).digest('hex')
        };
    }
    determineType(name, rel, content) {
        const low = rel.toLowerCase();
        const lowName = name.toLowerCase();
        // Generic heuristics
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
}
