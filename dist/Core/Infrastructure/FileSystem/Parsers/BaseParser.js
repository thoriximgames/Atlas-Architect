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
    nodeTypesConfig = null;
    async parse(filePath, root) {
        // Ensure config is loaded (could be optimized to load once per scan session)
        if (!this.nodeTypesConfig) {
            const configPath = path_1.default.join(root, '.atlas', 'data', 'node_types.json');
            if (await fs_extra_1.default.pathExists(configPath)) {
                this.nodeTypesConfig = await fs_extra_1.default.readJson(configPath);
            }
        }
        const content = await fs_extra_1.default.readFile(filePath, 'utf8');
        const ext = path_1.default.extname(filePath);
        const name = path_1.default.basename(filePath, ext);
        const rel = path_1.default.relative(root, filePath).replace(/\\/g, '/');
        const languageMap = {
            '.ts': 'TypeScript',
            '.js': 'JavaScript',
            '.tsx': 'TypeScript (React)',
            '.jsx': 'JavaScript (React)',
            '.cs': 'C#',
            '.cpp': 'C++',
            '.h': 'C++',
            '.hpp': 'C++',
            '.py': 'Python',
            '.json': 'JSON',
            '.md': 'Markdown',
            '.sh': 'Shell',
            '.ps1': 'PowerShell',
            '.mjs': 'JavaScript (ESM)'
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
        // If config is available, use dynamic heuristics
        if (this.nodeTypesConfig) {
            // First check explicit Protocol/Interface detection (strongest signals)
            if (lowName.startsWith('i') && /^[A-Z]/.test(name.substring(1)))
                return 'Interface';
            if (content.includes('interface ') || low.includes('/protocol/') || low.includes('/domain/services/')) {
                return 'Interface';
            }
            // Check keywords from config
            for (const typeId in this.nodeTypesConfig) {
                const typeDef = this.nodeTypesConfig[typeId];
                if (typeDef.keywords.some(kw => lowName.endsWith(kw.toLowerCase()) || lowName === kw.toLowerCase())) {
                    return typeId;
                }
            }
            // Fallback to directory-based heuristics if no keyword match
            if (low.includes('/logic/') || low.includes('/algorithms/'))
                return 'Logic';
            if (low.includes('/data/') || low.includes('/dto/') || low.includes('/model/'))
                return 'Data';
            if (low.includes('/services/'))
                return 'Service';
            if (low.includes('/components/') || low.includes('/ui/'))
                return 'Component';
            if (low.includes('/shared/') || low.includes('/utils/'))
                return 'Utility';
            return 'Unknown';
        }
        // --- LEGACY HARDCODED FALLBACK (If config fails to load) ---
        // 1. Protocols / Interfaces
        if (lowName.startsWith('i') && /^[A-Z]/.test(name.substring(1)))
            return 'Interface';
        if (content.includes('interface ') || content.includes('class I') || content.includes('struct I') || low.includes('/protocol/') || low.includes('/domain/services/')) {
            return 'Interface';
        }
        // 2. Systems / Core Logic
        const systemKeywords = [
            'manager', 'controller', 'system', 'engine', 'heartbeat', 'broadcaster',
            'registry', 'runner', 'host', 'server', 'application', 'gateway', 'orchestrator', 'index'
        ];
        const hasLifecycle = /void\s+(?:Awake|Start|Update|Init|Main|Execute|Tick|OnEnable)/i.test(content);
        const isContextOrRegistry = lowName.endsWith('context') || lowName.endsWith('registry');
        const isModuleOrRepo = lowName.endsWith('module') || lowName.endsWith('repository');
        if (hasLifecycle || systemKeywords.some(kw => lowName.endsWith(kw)) || isContextOrRegistry || isModuleOrRepo) {
            return 'System';
        }
        // 3. Logic / Algorithms
        const logicKeywords = [
            'strategy', 'builder', 'factory', 'calculator', 'parser', 'processor',
            'validator', 'mapper', 'resolver', 'generator', 'detector', 'scanner'
        ];
        if (logicKeywords.some(kw => lowName.endsWith(kw)) || low.includes('/logic/') || low.includes('/algorithms/')) {
            return 'Logic';
        }
        // 4. Data / DTOs
        if (low.includes('/data/') || low.includes('/dto/') || lowName.endsWith('data') || lowName.endsWith('template') || lowName.endsWith('params') || lowName.endsWith('model')) {
            return 'Data';
        }
        // 5. Services
        if (low.includes('/services/') || lowName.endsWith('service') || lowName.endsWith('provider') || lowName.endsWith('client')) {
            return 'Service';
        }
        // 6. Components
        if (low.includes('/components/') || lowName.endsWith('component') || low.includes('/ui/')) {
            return 'Component';
        }
        // 7. Utilities
        const utilKeywords = ['helper', 'utils', 'common', 'shared', 'extensions', 'tools', 'constants'];
        if (utilKeywords.some(kw => lowName.includes(kw)) || low.includes('/shared/') || low.includes('/utils/')) {
            return 'Utility';
        }
        return 'Unknown';
    }
}
exports.BaseParser = BaseParser;
