import glob from 'fast-glob';
import path from 'path';
import { ParserFactory } from './Parsers/ParserFactory.js';
export class FileScanner {
    exclude = [
        '**/bin/**', '**/obj/**', '**/*.meta', '**/*.asmdef', '**/node_modules/**', '**/.git/**',
        '**/Vendor/**', '**/Generated/**', '**/build/**', '**/CMakeFiles/**', '**/_deps/**'
    ];
    parserFactory;
    constructor() {
        this.parserFactory = new ParserFactory();
    }
    async scan(root) {
        // Adjust patterns to be relative to the root if needed, or absolute.
        // The original scanner used path.join(root, 'MMO-Server/src/**/*.{cpp,h,cs}')
        const patterns = [
            path.join(root, 'MMO-Server/src/**/*.{cpp,h,cs}').replace(/\\/g, '/'),
            path.join(root, 'MMO-Client/Assets/**/*.{cs}').replace(/\\/g, '/')
        ];
        const files = await glob(patterns, { ignore: this.exclude });
        const results = [];
        for (const file of files) {
            const parser = this.parserFactory.getParser(file);
            if (parser) {
                try {
                    const result = await parser.parse(file, root);
                    results.push(result);
                }
                catch (e) {
                    console.warn(`Failed to parse ${file}:`, e);
                }
            }
        }
        return this.mergeResults(results);
    }
    mergeResults(results) {
        const merged = new Map();
        for (const res of results) {
            const existing = merged.get(res.id);
            if (existing) {
                // Merge dependencies
                existing.dependencies = Array.from(new Set([...existing.dependencies, ...res.dependencies]));
                existing.baseClasses = Array.from(new Set([...existing.baseClasses, ...res.baseClasses]));
                // Keep the most descriptive name/type if possible
                if (existing.type === 'Unknown' && res.type !== 'Unknown') {
                    existing.type = res.type;
                }
            }
            else {
                merged.set(res.id, res);
            }
        }
        return Array.from(merged.values());
    }
}
