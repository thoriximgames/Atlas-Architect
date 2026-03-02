import { SourceFile } from '../Model/SourceFile';

export interface IScanner {
    scan(root: string, patterns: string[]): Promise<SourceFile[]>;
}
