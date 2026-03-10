import { SourceFile } from '../Model/SourceFile';
import { GraphNode } from '../Model/GraphNode';
import { IAtlasEdge } from '../../../Shared/Protocol';

export interface IGraphResult {
    nodes: Record<string, GraphNode>;
    edges: IAtlasEdge[];
}

export interface IGraphBuilder {
    build(files: SourceFile[], entryPoints: string[], strict?: boolean): IGraphResult;
}
