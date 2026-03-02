import { BaseParser } from './BaseParser.js';
import path from 'path';
export class CppParser extends BaseParser {
    canParse(filePath) {
        return filePath.endsWith('.cpp') || filePath.endsWith('.h');
    }
    extractDependencies(content, name) {
        const deps = new Set();
        const includes = content.matchAll(/#include\s+["<]([\w\/\.]+)[">]/g);
        for (const i of includes) {
            deps.add(path.basename(i[1], path.extname(i[1])));
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
