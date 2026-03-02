"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TsParser = void 0;
const BaseParser_1 = require("./BaseParser");
class TsParser extends BaseParser_1.BaseParser {
    canParse(filePath) {
        return filePath.endsWith('.ts') || filePath.endsWith('.js');
    }
    extractFields(content) {
        const fields = [];
        const fieldRegex = /(?:(public|private|protected)\s+)?(?:readonly\s+)?(\w+)\s*(?::\s*([\w<>\[\]]+))?\s*(?:=|;)/g;
        let match;
        while ((match = fieldRegex.exec(content)) !== null) {
            // Ignore common TS keywords
            if (['const', 'let', 'var', 'import', 'export', 'class', 'interface', 'type'].includes(match[2]))
                continue;
            fields.push({
                visibility: match[1] || 'public',
                type: match[3] || 'any',
                name: match[2]
            });
        }
        return fields;
    }
    calculateComplexity(content) {
        const keywords = ['if\\s*\\(', 'else if\\s*\\(', 'for\\s*\\(', 'while\\s*\\(', 'case\\s+', 'catch\\s*\\(', '&&', '\\|\\|', '\\?'];
        let score = 1;
        for (const word of keywords) {
            const regex = new RegExp(word, 'g');
            score += (content.match(regex) || []).length;
        }
        return score;
    }
    extractMethods(content) {
        const methods = [];
        // Matches "async public method(args): Promise<T> {" or "private method(args) {"
        const methodRegex = /(?:(public|private|protected)\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([\w<>\[\]]+))?\s*\{/g;
        let match;
        while ((match = methodRegex.exec(content)) !== null) {
            if (['if', 'for', 'while', 'switch', 'catch'].includes(match[2]))
                continue;
            methods.push({
                visibility: match[1] || 'public',
                returnType: match[4] || 'any',
                name: match[2],
                params: match[3].split(',').map(p => p.trim()).filter(p => p !== '')
            });
        }
        return methods;
    }
    extractEvents(content) {
        const events = [];
        // Match emit('event', data) or subscribe('event', callback)
        const emitRegex = /\.emit\(['"]([^'"]+)['"](?:,\s*([^)]+))?\)/g;
        let match;
        while ((match = emitRegex.exec(content)) !== null) {
            events.push({
                name: match[1],
                flow: 'publish',
                dataType: match[2] || 'any'
            });
        }
        const subRegex = /\.on\(['"]([^'"]+)['"]\s*,/g;
        while ((match = subRegex.exec(content)) !== null) {
            events.push({
                name: match[1],
                flow: 'subscribe'
            });
        }
        return events;
    }
    extractDependencies(content, name) {
        const deps = new Set();
        // Extract ES6 imports: import { X } from './Y' or import X from 'Z'
        const matches = content.matchAll(/import\s+(?:[\w\s{},*]+from\s+)?['"]([^'"]+)['"]/g);
        for (const m of matches) {
            const parts = m[1].split('/');
            const d = parts[parts.length - 1].replace(/\.(js|ts)$/, '');
            if (d && d !== name)
                deps.add(d);
        }
        // Extract class usages (new X())
        const instances = content.matchAll(/new\s+(\w+)\(/g);
        for (const i of instances) {
            if (i[1] && i[1] !== name)
                deps.add(i[1]);
        }
        return Array.from(deps);
    }
    extractBaseClasses(content) {
        const match = content.match(/class\s+\w+\s+(?:extends|implements)\s+([^{]+)/);
        if (!match)
            return [];
        return match[1].split(/,|implements|extends/).map(s => s.trim().split('.').pop()).filter(s => s.length > 0);
    }
    determineType(name, rel, content) {
        if (content.includes('interface ' + name))
            return 'Interface';
        if (name.endsWith('DTO'))
            return 'DTO';
        if (name.endsWith('Service'))
            return 'Service';
        return super.determineType(name, rel, content);
    }
}
exports.TsParser = TsParser;
