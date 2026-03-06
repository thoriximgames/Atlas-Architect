# Plan: SOLID Architectural Type System

## Objective
Implement a robust, single-source-of-truth system for defining `NodeType` definitions. This system will automatically synchronize the backend scanner heuristics, the frontend `ThemeManager` styling, and the visualizer `Legend` UI.

## Background & Motivation
Currently, adding a new `NodeType` is a fragmented process:
1.  Update `Protocol.ts` (Interface/Types).
2.  Update `BaseParser.ts` (Heuristics).
3.  Update `ThemeManager.ts` (Colors).
4.  Update `Legend.ts` (UI display).
This is error-prone, violates DRY (Don't Repeat Yourself), and makes the system rigid. We need a "Topology of Types" that drives all these layers.

## Scope & Impact
- **Affected Areas:**
  - `src/Shared/Protocol.ts`: Node type definitions.
  - `src/Core/Infrastructure/FileSystem/Parsers/BaseParser.ts`: Heuristic logic.
  - `viewer/src/Theme/ThemeManager.ts`: Styling logic.
  - `viewer/src/UI/Legend.ts`: UI rendering.
  - `atlas.mjs`: New command for managing types.
- **Impact:** Modular and extensible type system. Adding a new node type becomes a single configuration step that ripples through the entire solution.

## Proposed Solution

### 1. The Source of Truth (`nodes.config.json`)
Create a new configuration file (managed via `atlas.mjs`) that defines each `NodeType`:
```json
{
  "System": {
    "keywords": ["manager", "controller", "engine"],
    "style": { "fill": "#FFB8A8", "stroke": "#F24822" },
    "legend": { "label": "SYSTEM", "desc": "Core foundations", "shape": "square" }
  },
  ...
}
```

### 2. Backend Heuristic Injection
Modify `BaseParser` to load this config. The `determineType` method will dynamically check the `keywords` defined for each type in the config.

### 3. Frontend Theme & Legend Injection
- `ThemeManager` will load the styles from the API.
- `Legend` will generate its items list dynamically from the config instead of hardcoded arrays.

### 4. CLI Extension (`atlas.mjs`)
Add a new command:
- `node atlas.mjs type add <name> <keywords> <color> <shape> <desc>`
- `node atlas.mjs type list`

## Implementation Steps

### Phase 1: Foundation
1.  **Define Schema**: Create `src/Shared/NodeTypeConfig.ts` to define the shape of a Node Type definition.
2.  **Create Initial Config**: Generate `E:\GIT\Atlas-Architect\.atlas\data\node_types.json` with existing types.

### Phase 2: Backend Integration
1.  **Refactor BaseParser**: Change `determineType` to iterate over the loaded `node_types.json` configuration.
2.  **API Endpoint**: Add `/api/config/node-types` to `src/index.ts` to serve this config to the frontend.

### Phase 3: Frontend Integration
1.  **Refactor ThemeManager**: Initialize styles by fetching from the new API endpoint.
2.  **Refactor Legend**: Map over the configuration to render legend items.

### Phase 4: CLI Tooling
1.  **Update atlas.mjs**: Add `type` subcommand to manage the JSON configuration.

## Verification & Testing
1.  **Command Test**: Run `node atlas.mjs type add Gateway "gateway,portal" #AABBCC hexagon "Network Entry Point"`.
2.  **Scan Test**: Run `node atlas.mjs scan`. Verify a file named `MainGateway.ts` is automatically typed as `Gateway`.
3.  **Visual Test**: Open the browser. Verify the "GATEWAY" item appears in the Legend with a hexagon and the correct color.
