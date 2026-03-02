import { SourceFile } from '../Model/SourceFile';

export interface IParser {
    canParse(filePath: string): boolean;
    parse(filePath: string, root: string): Promise<SourceFile>;
}
