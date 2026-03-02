"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParserFactory = void 0;
const CSharpParser_1 = require("./CSharpParser");
const CppParser_1 = require("./CppParser");
const TsParser_1 = require("./TsParser");
const PythonParser_1 = require("./PythonParser");
class ParserFactory {
    parsers;
    constructor() {
        this.parsers = [
            new CSharpParser_1.CSharpParser(),
            new CppParser_1.CppParser(),
            new TsParser_1.TsParser(),
            new PythonParser_1.PythonParser()
        ];
    }
    getParser(filePath) {
        return this.parsers.find(p => p.canParse(filePath));
    }
}
exports.ParserFactory = ParserFactory;
