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

#### Step 1: Planning Layer (`docs/topology/planned.json`) - [COMPLETE]
- Registry for "Intent" is established.
- `planned.json` is merged into the master `atlas.json` during every scan.

#### Step 2: Visualizer Upgrades (Ghost Nodes) - [COMPLETE]
- Planned nodes are rendered with dashed borders.
- "Planned Gravity" analysis is integrated into the Layout Engine.

#### Step 3: The `atlas-architect` Skill - [ACTIVE]
- Skill provides CLI wrappers for `atlas scan`, `atlas plan`, and `atlas slice`.
- Automated `atlas sync` ensures parity between Toplogy and Pipeline documentation.

#### Step 4: Context Injection - [IN PROGRESS]
- Ongoing work to automate "Context Package" extraction for AI prompts based on topological neighbors.

---
*Last Updated: 2026-03-02*
*Status: Transitioning to Phase 3 & 4*
