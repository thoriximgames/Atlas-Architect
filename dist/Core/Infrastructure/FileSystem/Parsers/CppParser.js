"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CppParser = void 0;
const BaseParser_1 = require("./BaseParser");
const path_1 = __importDefault(require("path"));
class CppParser extends BaseParser_1.BaseParser {
    canParse(filePath) {
        return filePath.endsWith('.cpp') || filePath.endsWith('.h');
    }
    extractMethods(content) {
        const methods = [];
        // Matches typical C++ signatures: ReturnType ClassName::MethodName(args)
        const methodRegex = /(?:virtual\s+)?([\w<>:]+)\s+(?:[\w:]+::)?(\w+)\s*\(([^)]*)\)(?:\s*const)?\s*(?:{|;)/g;
        let match;
        while ((match = methodRegex.exec(content)) !== null) {
            if (['if', 'while', 'for', 'switch', 'catch', 'return'].includes(match[2]))
                continue;
            methods.push({
                visibility: 'public', // C++ visibility requires deeper scope parsing, default to public
                returnType: match[1],
                name: match[2],
                params: match[3].split(',').map(p => p.trim()).filter(p => p !== '')
            });
        }
        return methods;
    }
    extractFields(content) {
        const fields = [];
        // Basic match for field declarations: Type name;
        const fieldRegex = /^\s*([\w<>:]+(?:\s*\*)?)\s+(\w+)\s*;/gm;
        let match;
        while ((match = fieldRegex.exec(content)) !== null) {
            if (['return', 'typedef', 'using', 'friend'].includes(match[1]))
                continue;
            fields.push({
                visibility: 'private', // Default C++ class visibility
                type: match[1].trim(),
                name: match[2]
            });
        }
        return fields;
    }
    extractEvents(content) {
        return []; // Event extraction in C++ is highly project-specific, keeping blank for now
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
    extractDependencies(content, name) {
        const deps = new Set();
        const includes = content.matchAll(/#include\s+["<]([\w\/\.]+)[">]/g);
        for (const i of includes) {
            deps.add(path_1.default.basename(i[1], path_1.default.extname(i[1])));
        }
        return Array.from(deps);
    }
    extractBaseClasses(content) {
        // C++ base class extraction is complex, basic regex for now
        // class MyClass : public BaseClass
        const match = content.match(/class\s+\w+\s*:\s*(?:public|private|protected)\s+(\w+)/);
        return match ? [match[1]] : [];
    }
}
exports.CppParser = CppParser;
