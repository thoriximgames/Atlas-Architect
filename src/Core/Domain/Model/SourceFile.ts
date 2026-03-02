import { NodeType, IMethodDefinition, IEventDefinition, IFieldDefinition } from '../../../Shared/Protocol';

export interface SourceFile {
    id: string;
    name: string;
    filePath: string;
    type: NodeType;
    dependencies: string[];
    baseClasses: string[];
    methods: IMethodDefinition[];
    fields: IFieldDefinition[];
    events: IEventDefinition[];
    complexity: number;
    description?: string;
    hash: string;
    contractHash: string;
}
