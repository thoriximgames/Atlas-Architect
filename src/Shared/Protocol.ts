export type NodeType = 'System' | 'Service' | 'Component' | 'Interface' | 'DTO' | 'Logic' | 'Data' | 'Utility' | 'Unknown';
export type NodeStatus = 'planned' | 'verified' | 'orphan';
export type GuardState = 'none' | 'guarded' | 'restricted';
export type VerificationStatus = 'auto' | 'verified' | 'dirty';

export interface IMethodDefinition {
    name: string;
    visibility: 'public' | 'private' | 'protected';
    returnType: string;
    params: string[];
    description?: string;
}

export interface IFieldDefinition {
    name: string;
    visibility: 'public' | 'private' | 'protected';
    type: string;
    description?: string;
}

export interface IEventDefinition {
    name: string;
    flow: 'publish' | 'subscribe';
    dataType?: string;
    description?: string;
}

export interface IAtlasNode {
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

    // Initial Mathematical Position (Polar -> Cartesian)
    initialX: number;
    initialY: number;
    sectorAngle: number;
    sectorWidth: number;

    // Actual coordinates (used by D3 but stored for persistence)
    x?: number;
    y?: number;
}

export interface IPlannedNode {
    id: string; // usually the future file path or a unique ID
    name: string;
    type: NodeType;
    parentId: string;
    dependencies: string[];
    authorityId?: string;
    guardState?: GuardState;
    isAuthority?: boolean;
}

export type EdgeType = 'dependency' | 'inheritance' | 'event';

export interface IAtlasEdge {
    source: string;
    target: string;
    isGravity: boolean;
    type?: EdgeType;
}

export interface IAtlasRegistry {
    project: string;
    lastUpdated: string;
    nodes: Record<string, IAtlasNode>;
    edges: IAtlasEdge[];
}
