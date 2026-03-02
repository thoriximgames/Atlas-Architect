import fs from 'fs-extra';
import path from 'path';
import { GalaxyResolver } from './GalaxyResolver.js';
export class Registry {
    projectPath;
    dataPath;
    constructor(projectRoot) {
        this.projectPath = projectRoot;
        this.dataPath = path.join(projectRoot, 'atlas/data/atlas.json');
    }
    async save(nodes) {
        const resolver = new GalaxyResolver(nodes);
        const registry = resolver.resolve();
        // Ensure project name is properly formatted
        registry.project = path.basename(this.projectPath).toUpperCase();
        registry.lastUpdated = new Date().toISOString();
        await fs.outputJson(this.dataPath, registry, { spaces: 2 });
    }
}
