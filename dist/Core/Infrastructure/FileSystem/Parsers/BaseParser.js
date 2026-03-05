"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseParser = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
class BaseParser {
    async parse(filePath, root) {
        const content = await fs_extra_1.default.readFile(filePath, 'utf8');
        const ext = path_1.default.extname(filePath);
        const name = path_1.default.basename(filePath, ext);
        const rel = path_1.default.relative(root, filePath).replace(/\\/g, '/');
        const languageMap = {
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
            hash: crypto_1.default.createHash('md5').update(content).digest('hex'),
            contractHash: crypto_1.default.createHash('md5').update(publicContract).digest('hex')
        };
    }
    extractDocstring(content) {
        const match = content.match(/<summary>([\s\S]*?)<\/summary>/i) ||
            content.match(/\/\*\*([\s\S]*?)\*\//);
        if (!match)
            return undefined;
        return match[1]
            .replace(/\*|\/|\r|\n/g, ' ') // Remove comment markers and newlines
            .replace(/@brief|@method|@field/g, '') // Strip Doxygen tags
            .replace(/\s+/g, ' ') // Collapse whitespace
            .trim();
    }
    determineType(name, rel, content) {
        const low = rel.toLowerCase();
        const lowName = name.toLowerCase();
        // 1. Protocols / Interfaces
        if (lowName.startsWith('i') && /^[A-Z]/.test(name.substring(1)))
            return 'Interface';
        if (content.includes('class I') || content.includes('struct I') || low.includes('/protocol/'))
            return 'Interface';
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
        if (low.includes('/services/') || lowName.endsWith('service'))
            return 'Service';
        if (low.includes('/components/') || lowName.endsWith('component'))
            return 'Component';
        return 'Unknown';
    }
}
exports.BaseParser = BaseParser;
