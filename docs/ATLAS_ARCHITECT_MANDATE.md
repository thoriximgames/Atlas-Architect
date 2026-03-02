# Atlas Architectural Mandate (AAM)
## Phase 1: The Source of Truth (Planning)

### 1. Vision
Transform the Atlas tool from a passive visualizer into an **Active Architectural Registry**. The Architecture Graph is the primary contract. No logic change occurs without an architectural anchor.

### 2. Core Principles
- **Architecture-First:** New nodes must be defined in the planning registry before implementation.
- **Traceability:** Every node in the system must have a clear hierarchy (Parent) and identified Cross-Dependencies.
- **Automated Verification:** The "Definition of Done" requires the Atlas Scanner to verify that the implemented code matches the planned topology.
- **Context Preservation:** The AI must use Atlas data to understand the "Full Gravity" (total system impact) of any bug fix or feature.

### 3. Implementation Roadmap

#### Step 1: Planning Layer (`docs/topology/planned.json`)
- Create a registry for "Intent."
- Define `IPlannedNode` interface: `name`, `type`, `targetParent`, `expectedDependencies`.
- Update Atlas Engine to merge `planned.json` with `scanned.json`.

#### Step 2: Visualizer Upgrades (Ghost Nodes)
- Render planned nodes with dashed borders and partial opacity.
- Show "Planned Gravity" to see how new features will affect system complexity before coding.

#### Step 3: The `atlas-architect` Skill
- Define a new agent skill that enforces:
  1. `READ` Atlas graph before planning.
  2. `WRITE` to planned topology.
  3. `IMPLEMENT` code.
  4. `VERIFY` convergence between Plan and Scan.

#### Step 4: Context Injection
- Tool to export a specific node's "Context Package" (Node info + Parents + Dependencies + Child summaries) directly into the AI's prompt.

---
*Last Updated: 2026-02-16*
*Status: Initializing Phase 1*
