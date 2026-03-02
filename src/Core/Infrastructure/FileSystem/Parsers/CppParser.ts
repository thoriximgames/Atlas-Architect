import { BaseParser } from './BaseParser';
import { NodeType, IMethodDefinition, IEventDefinition, IFieldDefinition } from '../../../../Shared/Protocol';
import path from 'path';

export class CppParser extends BaseParser {
    canParse(filePath: string): boolean {
        return filePath.endsWith('.cpp') || filePath.endsWith('.h');
    }

    protected extractMethods(content: string): IMethodDefinition[] {
        const methods: IMethodDefinition[] = [];
        // Matches typical C++ signatures: ReturnType ClassName::MethodName(args)
        const methodRegex = /(?:virtual\s+)?([\w<>:]+)\s+(?:[\w:]+::)?(\w+)\s*\(([^)]*)\)(?:\s*const)?\s*(?:{|;)/g;
        let match;
        while ((match = methodRegex.exec(content)) !== null) {
            if (['if', 'while', 'for', 'switch', 'catch', 'return'].includes(match[2])) continue;
            methods.push({
                visibility: 'public', // C++ visibility requires deeper scope parsing, default to public
                returnType: match[1],
                name: match[2],
                params: match[3].split(',').map(p => p.trim()).filter(p => p !== '')
            });
        }
        return methods;
    }

    protected extractFields(content: string): IFieldDefinition[] {
        const fields: IFieldDefinition[] = [];
        // Basic match for field declarations: Type name;
        const fieldRegex = /^\s*([\w<>:]+(?:\s*\*)?)\s+(\w+)\s*;/gm;
        let match;
        while ((match = fieldRegex.exec(content)) !== null) {
            if (['return', 'typedef', 'using', 'friend'].includes(match[1])) continue;
            fields.push({
                visibility: 'private', // Default C++ class visibility
                type: match[1].trim(),
                name: match[2]
            });
        }
        return fields;
    }

    protected extractEvents(content: string): IEventDefinition[] {
        return []; // Event extraction in C++ is highly project-specific, keeping blank for now
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

    protected extractDependencies(content: string, name: string): string[] {
        const deps = new Set<string>();
        const includes = content.matchAll(/#include\s+["<]([\w\/\.]+)[">]/g);
        for (const i of includes) {
            deps.add(path.basename(i[1], path.extname(i[1])));
        }
        return Array.from(deps);
    }

    protected extractBaseClasses(content: string): string[] {
        // C++ base class extraction is complex, basic regex for now
        // class MyClass : public BaseClass
        const match = content.match(/class\s+\w+\s*:\s*(?:public|private|protected)\s+(\w+)/);
        return match ? [match[1]] : [];
    }
}
