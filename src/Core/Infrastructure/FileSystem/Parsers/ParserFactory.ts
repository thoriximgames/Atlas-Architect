import { IParser } from '../../../Domain/Services/IParser';
import { CSharpParser } from './CSharpParser';
import { CppParser } from './CppParser';
import { TsParser } from './TsParser';
import { PythonParser } from './PythonParser';

export class ParserFactory {
    private parsers: IParser[];

    constructor() {
        this.parsers = [
            new CSharpParser(),
            new CppParser(),
            new TsParser(),
            new PythonParser()
        ];
    }

    getParser(filePath: string): IParser | undefined {
        return this.parsers.find(p => p.canParse(filePath));
    }
}
