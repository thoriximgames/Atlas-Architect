import { BaseParser } from './BaseParser.js';
export class CSharpParser extends BaseParser {
    canParse(filePath) {
        return filePath.endsWith('.cs');
    }
    extractDependencies(content, name) {
        const deps = new Set();
        // Extract 'using' directives
        const matches = content.matchAll(/using\s+([\w\.]+);/g);
        for (const m of matches) {
            const d = m[1].split('.').pop();
            if (d && d !== 'System')
                deps.add(d);
        }
        // Extract static calls or instantiations
        const calls = content.matchAll(/(\w+)\.\w+\(/g);
        for (const c of calls) {
            if (c[1] && c[1] !== name)
                deps.add(c[1]);
        }
        return Array.from(deps);
    }
    extractBaseClasses(content) {
        const match = content.match(/(?:class|interface)\s+\w+\s*:\s*([^{]+)/);
        return match ? match[1].split(',').map(s => s.trim().split('.').pop()) : [];
    }
    determineType(name, rel, content) {
        // C# specific interface check
        if (content.includes('interface ' + name) || (name.startsWith('I') && /[A-Z]/.test(name[1]))) {
            return 'Interface';
        }
        return super.determineType(name, rel, content);
    }
}
