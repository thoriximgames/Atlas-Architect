import { NodeType, NodeStatus, GuardState, VerificationStatus, IMethodDefinition, IEventDefinition, IFieldDefinition } from '../../../Shared/Protocol';

export interface GraphNode {
    id: string;
    name: string;
    type: NodeType;
    file: string;
    depth: number;
    parentId?: string;
    islandId: string;
    descendantCount: number;
    dependencies: string[];
    baseClasses: string[];
    methods: IMethodDefinition[];
    fields: IFieldDefinition[];
    events: IEventDefinition[];
    complexity: number;
    description?: string;
    lastModifiedBy?: string;
    implementationNotes?: string;
    violations: string[];
    color: string;
    status: NodeStatus;
    
    // Auditing & Drift
    verificationStatus: VerificationStatus;
    authorityId?: string;
    guardState?: GuardState;
    isAuthority?: boolean;
    verifiedHash?: string;
    contractHash?: string;
    verifiedBy?: string;
    verificationTimestamp?: string;

    // Layout properties
    initialX: number;
    initialY: number;
    sectorAngle: number;
    sectorWidth: number;
}
