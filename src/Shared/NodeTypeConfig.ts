export type NodeShape = 'square' | 'hexagon' | 'diamond' | 'octagon' | 'circle';

export interface INodeTypeDefinition {
    id: string; // The type name (e.g., 'System')
    keywords: string[];
    style: {
        fill: string;
        stroke: string;
        text: string;
    };
    legend: {
        label: string;
        desc: string;
        shape: NodeShape;
    };
}

export type NodeTypesConfig = Record<string, INodeTypeDefinition>;
