export interface IArchitecturalRule {
    from: string; // NodeType or ID pattern
    cannot_depend_on: string[]; // NodeType or ID pattern
    except?: string[]; // IDs or names to ignore
    reason?: string;
}

export interface IAtlasConfig {
    project: string;
    scanPatterns: string[];
    entryPoints: string[];
    exclude: string[];
    port: number;
    rules?: IArchitecturalRule[];
}
