import { BaseParser } from './BaseParser';
import { NodeType, IMethodDefinition, IEventDefinition, IFieldDefinition } from '../../../../Shared/Protocol';

export class TsParser extends BaseParser {
    canParse(filePath: string): boolean {
        return filePath.endsWith('.ts') || filePath.endsWith('.js');
    }

    protected extractFields(content: string): IFieldDefinition[] {
        const fields: IFieldDefinition[] = [];
        const fieldRegex = /(?:(public|private|protected)\s+)?(?:readonly\s+)?(\w+)\s*(?::\s*([\w<>\[\]]+))?\s*(?:=|;)/g;
        let match;
        while ((match = fieldRegex.exec(content)) !== null) {
            // Ignore common TS keywords
            if (['const', 'let', 'var', 'import', 'export', 'class', 'interface', 'type'].includes(match[2])) continue;
            fields.push({
                visibility: (match[1] as any) || 'public',
                type: match[3] || 'any',
                name: match[2]
            });
        }
        return fields;
    }

    protected calculateComplexity(content: string): number {
        const keywords = ['if\\s*\\(', 'else if\\s*\\(', 'for\\s*\\(', 'while\\s*\\(', 'case\\s+', 'catch\\s*\\(', '&&', '\\|\\|', '\\?'];
        let score = 1;
        for (const word of keywords) {
            const regex = new RegExp(word, 'g');
            score += (content.match(regex) || []).length;
        }
        return score;
    }

    protected extractMethods(content: string): IMethodDefinition[] {
        const methods: IMethodDefinition[] = [];
        // Matches "async public method(args): Promise<T> {" or "private method(args) {"
        const methodRegex = /(?:(public|private|protected)\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([\w<>\[\]]+))?\s*\{/g;
        let match;
        while ((match = methodRegex.exec(content)) !== null) {
            if (['if', 'for', 'while', 'switch', 'catch'].includes(match[2])) continue;
            methods.push({
                visibility: (match[1] as any) || 'public',
                returnType: match[4] || 'any',
                name: match[2],
                params: match[3].split(',').map(p => p.trim()).filter(p => p !== '')
            });
        }
        return methods;
    }

    protected extractEvents(content: string): IEventDefinition[] {
        const events: IEventDefinition[] = [];
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

    protected extractDependencies(content: string, name: string): string[] {
        const deps = new Set<string>();
        
        // Extract ES6 imports: import { X } from './Y' or import X from 'Z'
        const matches = content.matchAll(/import\s+(?:[\w\s{},*]+from\s+)?['"]([^'"]+)['"]/g);
        for (const m of matches) {
            const parts = m[1].split('/');
            const d = parts[parts.length - 1].replace(/\.(js|ts)$/, '');
            if (d && d !== name) deps.add(d);
        }

        // Extract class usages (new X())
        const instances = content.matchAll(/new\s+(\w+)\(/g);
        for (const i of instances) {
            if (i[1] && i[1] !== name) deps.add(i[1]);
        }
        
        return Array.from(deps);
    }

    protected extractBaseClasses(content: string): string[] {
        const match = content.match(/class\s+\w+\s+(?:extends|implements)\s+([^{]+)/);
        if (!match) return [];
        return match[1].split(/,|implements|extends/).map(s => s.trim().split('.').pop()!).filter(s => s.length > 0);
    }

    protected determineType(name: string, rel: string, content: string): NodeType {
        if (content.includes('interface ' + name)) return 'Interface';
        if (name.endsWith('DTO')) return 'DTO';
        if (name.endsWith('Service')) return 'Service';
        return super.determineType(name, rel, content);
    }
}
