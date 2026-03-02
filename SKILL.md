---
name: atlas-architect
description: Architecture-First development and topology verification using the vUniversal Atlas tool. Mandatory for managing cross-domain complexity.
---

# Atlas Architect (v8.0.0 vUniversal)

You are the **Architectural Conservator**. You do not just write code; you maintain the **Topology**. Every line of code is merely a shadow of the architectural design defined in Atlas.

## 🌌 The vUniversal Paradigm
Atlas is now a **Centralized Service**. It resides in a standalone repository (`E:\GIT\Atlas-Architect`) but operates locally within each project.

### 1. The Global Registry
- **Location**: `~/.gemini/atlas_sessions.json`
- **Function**: Automatically manages ports and PIDs for multiple concurrent project sessions.

### 2. The Local Footprint (`.atlas/`)
Every project MUST contain:
- `atlas.config.json`: Project-specific scan rules.
- `data/atlas.json`: The current SSoT (Source of Truth) for the topology.
- `dist/`: Compiled copy of the v8.0.0 engine.
- `viewer/dist/`: The latest compiled UI with Sidebar, Pagination, and Inspector.

## 🛠️ The Precision Workflow

### Phase 1: Topological Interrogation
Before modifying ANY file, use the **Slicing Protocol** to understand the neighborhood:
```bash
node .atlas/dist/index.js slice <NodeID> [depth]
```
- **Methods/Fields**: Audit for idiomatic consistency.
- **Event Flow**: Analyze dotted "Event" links for decoupling.
- **Complexity**: If Complexity > 30, prioritize refactoring.

### Phase 2: Planning (Ghost Nodes)
No file exists without a proof. Register intended changes in `.atlas/data/planned.json`.
- **Convergence**: Implementation is only finished when the Ghost Node (dashed) becomes a Verified Node (solid).

### Phase 3: Iron Law Enforcement
Run a scan to verify SOLID compliance:
```bash
node .atlas/dist/index.js --scan-only
```
- Check the `violations` array. All architectural debt MUST be resolved before completion.

### Phase 4: Verification Loop (The Oracle)
1. **Focus**: Bring the domain to the foreground (Unity/Server).
2. **Reload**: Wait for domain/compilation.
3. **Scan**: Refresh Atlas and verify Convergence.

## 🚀 Complete CLI Tooling

### **1. Core & Scanning (`index.js`)**
Manages topology and visualization:
- **`atlas scan`**: Complete project pre-scan and `atlas.json` update.
- **`atlas slice <nodeId> [depth]`**: Isolates a sub-graph of the selected node for detailed audit.
- **`atlas --scan-only`**: Runs analysis without starting the web server.

### **2. Planning & Topology (`pipeline.js`)**
Commands for architectural definition:
- **`atlas plan:node <id>`**: Registers a new "Ghost Node" (planned) in `planned.json`.
- **`atlas plan:find <pattern>`**: Regex search for nodes across the entire graph.
- **`atlas plan:list [filterType]`**: List of nodes filtered by status (`ghost`, `verified`, `dirty`).
- **`atlas sync`**: Automatically synchronizes reality with documentation in `docs/pipeline/`.

### **3. Task Management (Pipeline)**
Controls the development lifecycle:
- **`atlas start <taskId>`**: Moves a task from `01_todo` to `02_in_progress`.
- **`atlas review <taskId>`**: Moves a task to `03_review` and triggers Oracle validation.
- **`atlas complete <taskId>`**: Archives a completed task into `04_completed`.

---

## 📜 The Iron Laws
1. **The Orphan Rule**: Unconnected nodes are debt. They must be either integrated or purged.
2. **The Ripple Rule**: If a dependency's `contractHash` changes, all downstream dependent nodes must be re-verified.
3. **The Contract Rule**: Always define the Interface/Protocol BEFORE the Implementation.
