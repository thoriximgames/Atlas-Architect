import { BaseParser } from './BaseParser';
import { NodeType, IEventDefinition, IMethodDefinition, IFieldDefinition } from '../../../../Shared/Protocol';
import path from 'path';

export class CSharpParser extends BaseParser {
    canParse(filePath: string): boolean {
        return filePath.endsWith('.cs');
    }

    protected extractMethods(content: string): IMethodDefinition[] {
        const methods: IMethodDefinition[] = [];
        const methodRegex = /(public|private|protected|internal)\s+(?:static\s+)?([\w<>\[\]]+)\s+(\w+)\s*\(([^)]*)\)/g;
        let match;
        while ((match = methodRegex.exec(content)) !== null) {
            // Exclude common false positives like "if (", "while (" 
            if (['if', 'while', 'for', 'switch', 'catch', 'lock', 'using'].includes(match[3])) continue;

            const beforeMethod = content.substring(Math.max(0, match.index - 500), match.index);
            const docMatch = beforeMethod.match(/<summary>([\s\S]*?)<\/summary>/i);

            methods.push({
                visibility: match[1] as any,
                returnType: match[2],
                name: match[3],
                params: match[4].split(',').map(p => p.trim()).filter(p => p !== ''),
                description: docMatch ? docMatch[1].replace(/\*|\/|\r|\n/g, '').trim() : undefined
            });
        }
        return methods;
    }

    protected extractFields(content: string): IFieldDefinition[] {
        const fields: IFieldDefinition[] = [];
        // Match C# properties or simple fields
        const fieldRegex = /(public|private|protected|internal)\s+(?:readonly\s+)?(?:static\s+)?([\w<>\[\]]+)\s+(\w+)\s*(?:\{|;|=(?!>))/g;
        let match;
        while ((match = fieldRegex.exec(content)) !== null) {
            if (['class', 'interface', 'namespace', 'using', 'return', 'get', 'set'].includes(match[2])) continue;
            fields.push({
                visibility: match[1] as any,
                type: match[2],
                name: match[3]
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

    protected extractEvents(content: string): IEventDefinition[] {
        const events: IEventDefinition[] = [];

        // 1. Standard C# Events (Declarations)
        // Matches: public [static] event Action<T1, T2> OnSomething;
        const stdEventRegex = /public\s+(?:static\s+)?event\s+(?:Action|EventHandler)(?:<([^>]+)>)?\s+(\w+)/g;
        let match;
        while ((match = stdEventRegex.exec(content)) !== null) {
            events.push({
                name: match[2],
                flow: 'publish',
                dataType: match[1] || 'void'
            });
        }

        // 2. Subscriptions (+= HandleSomething)
        // Matches: EventName += HandleMethod;
        const subRegex = /(\w+)\s*\+=\s*(\w+)/g;
        while ((match = subRegex.exec(content)) !== null) {
            if (!['static', 'public', 'private', 'protected'].includes(match[1])) {
                events.push({
                    name: match[1],
                    flow: 'subscribe'
                });
            }
        }

        // 3. Project Specific: EmitMethod (SessionEvents.EmitStateChanged)
        const emitRegex = /\.Emit(\w+)\s*\(/g;
        while ((match = emitRegex.exec(content)) !== null) {
            events.push({
                name: 'On' + match[1], // Normalize to 'On' prefix to match standard naming
                flow: 'publish'
            });
        }

        return events;
    }

    protected extractDependencies(content: string, name: string): string[] {
        const deps = new Set<string>();
        
        // 1. Extract 'using' directives
        const usings = content.matchAll(/using\s+([\w\.]+);/g);
        for (const m of usings) {
            const d = m[1].split('.').pop();
            if (d && !['System', 'UnityEngine', 'Collections', 'Generic', 'Linq'].includes(d)) {
                deps.add(d);
            }
        }

        // 2. Extract Field/Property types (Ownership/Usage)
        // Matches "private Type _name;" or "public Type Name { get; }" or "Type name ="
        const types = content.matchAll(/(?:private|public|protected|internal)\s+(?:readonly\s+)?([\w<>\[\]]+)\s+\w+/g);
        for (const t of types) {
            const typeName = t[1].replace(/[<>\[\]]/g, '').trim();
            if (typeName && typeName !== name && !this.isCommonType(typeName)) {
                deps.add(typeName);
            }
        }

        // 3. Extract static calls or instantiations
        const calls = content.matchAll(/(\w+)\.\w+\(/g);
        for (const c of calls) {
            if (c[1] && c[1] !== name && !this.isCommonType(c[1])) deps.add(c[1]);
        }
        
        return Array.from(deps);
    }

    private isCommonType(type: string): boolean {
        const keywords = [
            'string', 'int', 'float', 'bool', 'void', 'var', 'Task', 'List', 'Dictionary', 
            'GameObject', 'Transform', 'Vector2', 'Vector3', 'Quaternion', 'static', 
            'readonly', 'class', 'struct', 'interface', 'public', 'private', 'protected', 'internal',
            'async', 'await', 'return', 'get', 'set'
        ];
        return keywords.includes(type);
    }

    protected extractBaseClasses(content: string): string[] {
        const match = content.match(/(?:class|interface)\s+\w+\s*:\s*([^{]+)/);
        return match ? match[1].split(',').map(s => s.trim().split('.').pop()!) : [];
    }

    protected determineType(name: string, rel: string, content: string): NodeType {
        if (/\binterface\s+\w+/.test(content)) return 'Interface';
        if (/\bstruct\s+\w+/.test(content)) return 'DTO';
        if (/\benum\s+\w+/.test(content)) return 'Data';
        if (/\bstatic\s+class\s+\w+/.test(content)) return 'Utility';
        
        // Let the BaseParser's semantic logic handle the heavy lifting (Logic vs Data)
        const type = super.determineType(name, rel, content);
        
        // Refine based on C# Specifics
        const bases = this.extractBaseClasses(content);
        if (bases.length > 0) {
            // If it inherits from something that sounds like an engine hook or system
            if (bases.some(b => /Mono|Controller|Manager|System|Engine|Service/i.test(b))) return 'System';
            // If it's a data container
            if (bases.some(b => /Object|Data|Template|Asset|Entity/i.test(b))) return 'Data';
        }

        if (name.endsWith('DTO') || rel.includes('/Protocol/') || rel.includes('/DTO/')) return 'DTO';
        if (name.endsWith('Utility') || name.endsWith('Extensions') || name.endsWith('Helper')) return 'Utility';

        return type;
    }
}
