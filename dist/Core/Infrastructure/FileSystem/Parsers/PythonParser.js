"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonParser = void 0;
const BaseParser_1 = require("./BaseParser");
class PythonParser extends BaseParser_1.BaseParser {
    canParse(filePath) {
        return filePath.endsWith('.py');
    }
    extractDependencies(content, name) {
        const deps = new Set();
        // Match `import x` or `from x import y`
        const importRegex = /^(?:from\s+([\w.]+)\s+)?import\s+([\w.,\s]+)/gm;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const baseModule = match[1];
            if (baseModule) {
                deps.add(baseModule.split('.')[0]); // Add root module
            }
            else {
                const modules = match[2].split(',').map(m => m.trim().split(' ')[0]);
                for (const m of modules) {
                    deps.add(m);
                }
            }
        }
        return Array.from(deps);
    }
    extractBaseClasses(content) {
        const match = content.match(/class\s+\w+\(([^)]+)\):/);
        return match ? match[1].split(',').map(s => s.trim()) : [];
    }
    extractMethods(content) {
        const methods = [];
        // Matches `def method_name(self, args) -> Type:`
        const methodRegex = /def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([\w\[\], ]+))?:/g;
        let match;
        while ((match = methodRegex.exec(content)) !== null) {
            const isPrivate = match[1].startsWith('_') && !match[1].startsWith('__');
            methods.push({
                visibility: isPrivate ? 'private' : 'public',
                returnType: match[3] || 'Any',
                name: match[1],
                params: match[2].split(',').map(p => p.trim()).filter(p => p !== '' && p !== 'self')
            });
        }
        return methods;
    }
    extractFields(content) {
        const fields = [];
        // Match `self.field_name: Type = ...` or `self.field_name = ...`
        const fieldRegex = /self\.(\w+)(?:\s*:\s*([\w\[\], ]+))?\s*=/g;
        let match;
        while ((match = fieldRegex.exec(content)) !== null) {
            const isPrivate = match[1].startsWith('_');
            fields.push({
                visibility: isPrivate ? 'private' : 'public',
                type: match[2] || 'Any',
                name: match[1]
            });
        }
        return fields;
    }
    extractEvents(content) {
        return []; // Python eventing is usually custom, leaving blank for now.
    }
    calculateComplexity(content) {
        const keywords = ['if\s+', 'elif\s+', 'for\s+', 'while\s+', 'except\s+', 'and\s+', 'or\s+'];
        let score = 1;
        for (const word of keywords) {
            const regex = new RegExp(word, 'g');
            score += (content.match(regex) || []).length;
        }
        return score;
    }
    extractDocstring(content) {
        const match = content.match(/"""([\s\S]*?)"""/);
        return match ? match[1].trim() : undefined;
    }
    determineType(name, rel, content) {
        if (name.includes('test') || rel.includes('test'))
            return 'Utility';
        return super.determineType(name, rel, content);
    }
}
exports.PythonParser = PythonParser;
