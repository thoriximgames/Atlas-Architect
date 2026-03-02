"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileScanner = void 0;
const fast_glob_1 = __importDefault(require("fast-glob"));
const path_1 = __importDefault(require("path"));
const ParserFactory_1 = require("./Parsers/ParserFactory");
class FileScanner {
    exclude = [
        '**/bin/**', '**/obj/**', '**/*.meta', '**/*.asmdef', '**/node_modules/**', '**/.git/**',
        '**/Vendor/**', '**/Generated/**', '**/build/**', '**/CMakeFiles/**', '**/_deps/**'
    ];
    parserFactory;
    constructor() {
        this.parserFactory = new ParserFactory_1.ParserFactory();
    }
    async scan(root, patterns) {
        const globPatterns = patterns.map(p => path_1.default.join(root, p).replace(/\\/g, '/'));
        const files = await (0, fast_glob_1.default)(globPatterns, { ignore: this.exclude });
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
exports.FileScanner = FileScanner;
