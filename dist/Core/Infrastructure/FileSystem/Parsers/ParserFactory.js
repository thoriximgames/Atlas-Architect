import { CSharpParser } from './CSharpParser.js';
import { CppParser } from './CppParser.js';
export class ParserFactory {
    parsers;
    constructor() {
        this.parsers = [
            new CSharpParser(),
            new CppParser()
        ];
    }
    getParser(filePath) {
        return this.parsers.find(p => p.canParse(filePath));
    }
}
