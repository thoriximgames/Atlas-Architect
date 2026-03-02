export class AtlasEngine {
    scanner;
    graphBuilder;
    layoutStrategy;
    constructor(scanner, graphBuilder, layoutStrategy) {
        this.scanner = scanner;
        this.graphBuilder = graphBuilder;
        this.layoutStrategy = layoutStrategy;
    }
    async run(projectRoot) {
        console.log(`[AtlasEngine] Scanning ${projectRoot}...`);
        const files = await this.scanner.scan(projectRoot);
        console.log(`[AtlasEngine] Found ${files.length} source files.`);
        console.log(`[AtlasEngine] Building dependency graph...`);
        const graph = this.graphBuilder.build(files);
        console.log(`[AtlasEngine] Applying layout strategy...`);
        this.layoutStrategy.applyLayout(graph.nodes);
        return {
            project: "MMO-SUITE",
            lastUpdated: new Date().toISOString(),
            nodes: graph.nodes,
            edges: graph.edges
        };
    }
}
