import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { AtlasEngine } from './Core/Application/AtlasEngine.js';
import { FileScanner } from './Core/Infrastructure/FileSystem/FileScanner.js';
import { GraphBuilder } from './Core/Infrastructure/Graph/GraphBuilder.js';
import { PolarLayoutStrategy } from './Core/Infrastructure/Layout/PolarLayoutStrategy.js';
async function main() {
    const root = process.cwd();
    const app = express();
    // Composition Root
    const scanner = new FileScanner();
    const graphBuilder = new GraphBuilder();
    const layoutStrategy = new PolarLayoutStrategy();
    const engine = new AtlasEngine(scanner, graphBuilder, layoutStrategy);
    const scanAndResolve = async () => {
        // Assume the project root to scan is one level up, as per original logic
        const projectRoot = path.resolve(root, '../');
        const registry = await engine.run(projectRoot);
        await fs.outputJson(path.join(root, 'data/atlas.json'), registry, { spaces: 2 });
        return registry;
    };
    app.use('/viewer', express.static(path.join(root, 'viewer/dist')));
    app.get('/data/atlas.json', (req, res) => res.sendFile(path.join(root, 'data/atlas.json')));
    app.get(/\/viewer.*/, (req, res) => res.sendFile(path.join(root, 'viewer/dist/index.html')));
    await scanAndResolve();
    app.listen(5000, () => console.log('Atlas SOLID v8.0: http://localhost:5000/viewer/'));
}
main();
