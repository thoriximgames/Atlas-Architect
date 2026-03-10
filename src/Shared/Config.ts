export interface IArchitecturalRule {
    from: string; // NodeType or ID pattern
    cannot_depend_on: string[]; // NodeType or ID pattern
    except?: string[]; // IDs or names to ignore
    reason?: string;
}

/**
 * IAtlasConfig: The architectural ruleset and system configuration.
 * 
 * DESIGN INTENT:
 * Serves as the "Foundational Mandate" for an Atlas project. It defines the 
 * scanning boundaries and, most importantly, the architectural constraints (rules) 
 * that the engine uses to detect "Iron Law" violations.
 * 
 * KEY RESPONSIBILITIES:
 * 1. Defines project entry points and file inclusion/exclusion patterns.
 * 2. Houses the Architectural Ruleset used for automated linting.
 * 3. Configures environmental properties like the service port.
 */
export interface IAtlasConfig {
    project: string;
    scanPatterns: string[];
    entryPoints: string[];
    exclude: string[];
    port: number;
    strict?: boolean; // If true, only include nodes reachable from entryPoints
    rules?: IArchitecturalRule[];
}
