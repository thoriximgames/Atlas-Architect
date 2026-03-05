import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { IParser } from '../../../Domain/Services/IParser';
import { SourceFile } from '../../../Domain/Model/SourceFile';
import { NodeType, IMethodDefinition, IEventDefinition, IFieldDefinition } from '../../../../Shared/Protocol';

export abstract class BaseParser implements IParser {
    abstract canParse(filePath: string): boolean;

    async parse(filePath: string, root: string): Promise<SourceFile> {
        const content = await fs.readFile(filePath, 'utf8');
        const ext = path.extname(filePath);
        const name = path.basename(filePath, ext);
        const rel = path.relative(root, filePath).replace(/\\/g, '/');

        const languageMap: Record<string, string> = {
            '.ts': 'TypeScript',
            '.js': 'JavaScript',
            '.cs': 'C#',
            '.cpp': 'C++',
            '.h': 'C++',
            '.py': 'Python',
            '.json': 'JSON',
            '.md': 'Markdown'
        };

        const methods = this.extractMethods(content);
        const fields = this.extractFields(content);
        const events = this.extractEvents(content);

        // Calculate Contract Hash (Public API Only)
        const publicContract = JSON.stringify({
            methods: methods.filter(m => m.visibility === 'public'),
            fields: fields.filter(f => f.visibility === 'public'),
            events: events
        });

        return {
            id: rel.replace(ext, ''),
            name,
            filePath: rel,
            language: languageMap[ext.toLowerCase()] || 'Plain Text',
            type: this.determineType(name, rel, content),
            dependencies: this.extractDependencies(content, name),
            baseClasses: this.extractBaseClasses(content),
            methods,
            fields,
            events,
            complexity: this.calculateComplexity(content),
            description: this.extractDocstring(content),
            hash: crypto.createHash('md5').update(content).digest('hex'),
            contractHash: crypto.createHash('md5').update(publicContract).digest('hex')
        };
    }

    protected abstract extractDependencies(content: string, name: string): string[];
    protected abstract extractBaseClasses(content: string): string[];
    protected abstract extractMethods(content: string): IMethodDefinition[];
    protected abstract extractFields(content: string): IFieldDefinition[];
    protected abstract extractEvents(content: string): IEventDefinition[];
    protected abstract calculateComplexity(content: string): number;

    protected extractDocstring(content: string): string | undefined {
        const match = content.match(/<summary>([\s\S]*?)<\/summary>/i) || 
                      content.match(/\/\*\*([\s\S]*?)\*\//);
        
        if (!match) return undefined;

        return match[1]
            .replace(/\*|\/|\r|\n/g, ' ') // Remove comment markers and newlines
            .replace(/@brief|@method|@field/g, '') // Strip Doxygen tags
            .replace(/\s+/g, ' ') // Collapse whitespace
            .trim();
    }

    protected determineType(name: string, rel: string, content: string): NodeType {
        const low = rel.toLowerCase();
        const lowName = name.toLowerCase();

        // 1. Protocols / Interfaces
        if (lowName.startsWith('i') && /^[A-Z]/.test(name.substring(1))) return 'Interface';
        if (content.includes('class I') || content.includes('struct I') || low.includes('/protocol/')) return 'Interface';

        // 2. Systems / Core Logic
        const hasLifecycle = /void\s+(?:Awake|Start|Update|Init|Main|Execute|Tick|OnEnable)/i.test(content);
        const isContextOrRegistry = lowName.endsWith('context') || lowName.endsWith('registry');
        const isModuleOrRepo = lowName.endsWith('module') || lowName.endsWith('repository');
        
        if (hasLifecycle || lowName.endsWith('manager') || lowName.endsWith('controller') || lowName.endsWith('system') || isContextOrRegistry || isModuleOrRepo) {
            return 'System';
        }

        // 3. Data / DTOs
        if (low.includes('/data/') || low.includes('/dto/') || lowName.endsWith('data') || lowName.endsWith('template') || lowName.endsWith('params')) {
            return 'Data';
        }

        if (low.includes('/services/') || lowName.endsWith('service')) return 'Service';
        if (low.includes('/components/') || lowName.endsWith('component')) return 'Component';
        
        return 'Unknown';
    }
}
