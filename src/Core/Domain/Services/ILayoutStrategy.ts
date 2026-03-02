import { GraphNode } from '../Model/GraphNode';

export interface ILayoutStrategy {
    applyLayout(nodes: Record<string, GraphNode>): void;
}
