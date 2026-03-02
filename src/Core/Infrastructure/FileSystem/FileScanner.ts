import glob from 'fast-glob';
import path from 'path';
import { IScanner } from '../../Domain/Services/IScanner';
import { SourceFile } from '../../Domain/Model/SourceFile';
import { ParserFactory } from './Parsers/ParserFactory';

export class FileScanner implements IScanner {
    private exclude = [
        '**/bin/**', '**/obj/**', '**/*.meta', '**/*.asmdef', '**/node_modules/**', '**/.git/**',
        '**/Vendor/**', '**/Generated/**', '**/build/**', '**/CMakeFiles/**', '**/_deps/**'
    ];

    private parserFactory: ParserFactory;

    constructor() {
        this.parserFactory = new ParserFactory();
    }

    async scan(root: string, patterns: string[]): Promise<SourceFile[]> {
        const globPatterns = patterns.map(p => path.join(root, p).replace(/\\/g, '/'));

        const files = await glob(globPatterns, { ignore: this.exclude });
        const results: SourceFile[] = [];

        for (const file of files) {
            const parser = this.parserFactory.getParser(file);
            if (parser) {
                try {
                    const result = await parser.parse(file, root);
                    results.push(result);
                } catch (e) {
                    console.warn(`Failed to parse ${file}:`, e);
                }
            }
        }
        
        return this.mergeResults(results);
    }

    private mergeResults(results: SourceFile[]): SourceFile[] {
        const merged = new Map<string, SourceFile>();
        
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
            } else {
                merged.set(res.id, res);
            }
        }
        
        return Array.from(merged.values());
    }
}
