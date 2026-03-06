# Plan: Robust Node Shape & Type Control System

## Objective
Implement a formalized, extensible shape rendering system for the Atlas Architect. This includes a fixed set of supported shapes, dynamic backend and frontend synchronization, and enhanced CLI commands for full node type lifecycle management.

## Background & Motivation
The current shape implementation is fragmented and difficult to verify. Shapes are appearing as default circles because the mapping between configuration and rendering is not robust enough. We need a system where shapes are treated as first-class citizens with a clearly defined "menu" of options.

## Scope & Impact
- **Affected Files:**
  - `src/Shared/NodeTypeConfig.ts`: Formalize `NodeShape` enum.
  - `E:\GIT\Atlas-Architect\.atlas\data\node_types.json`: Centralize shape definitions.
  - `viewer/src/Renderer/StageRenderer.ts`: Robust shape rendering logic.
  - `atlas.mjs`: New commands for shape listing and type updating.
- **Impact:** Complete control over architectural visual identity. Adding or changing a node type's appearance becomes a single command operation.

## Proposed Solution

### 1. Formalized Shape Registry
Define a specific set of supported geometric primitives:
- `circle`: Standard circle.
- `square`: Rounded square.
- `hexagon`: 6-sided polygon.
- `octagon`: 8-sided polygon.
- `diamond`: 4-sided rotated polygon.
- `triangle`: 3-sided polygon.
- `pentagon`: 5-sided polygon.

### 2. Enhanced CLI Commands
Update `atlas.mjs` with:
- `node atlas.mjs type shapes`: Display a visual list of supported shapes.
- `node atlas.mjs type add`: Ensure it overwrites/updates existing types.
- `node atlas.mjs type set <typeName> <property> <value>`: Specialized command to update specific fields (e.g., `shape`, `color`, `keywords`).

### 3. Robust Rendering Pipeline
- Ensure `ThemeManager` always provides a fallback shape.
- Fix `StageRenderer` to strictly use the configuration-driven shape.
- Implement a "Force Rebuild" mechanism in `atlas.mjs` to ensure frontend changes are always live.

## Implementation Steps

### Phase 1: Formalization
1.  **Update `NodeTypeConfig.ts`**: Expand `NodeShape` type definition.
2.  **Seed `node_types.json`**: Ensure all default types have explicit shapes.

### Phase 2: CLI Power-up
1.  **Add `type shapes` command**: Hardcoded list of supported strings.
2.  **Add `type set` command**: Implementation for updating JSON fields.
3.  **Refactor `type add`**: Make it an upsert.

### Phase 3: Rendering Fixes
1.  **Refactor `StageRenderer.getPathForType`**: Ensure it handles all new shapes.
2.  **Fix `BaseParser` Cache**: Ensure backend reloads config if it changes during a session.

### Phase 4: Build & Verify
1.  **Force Rebuild Tooling**: Update `atlas.mjs` to clear cache/dist on sensitive changes.
2.  **Verify Gateway**: Add a file that matches the "Gateway" keyword and confirm its hexagon shape.

## Verification & Testing
1.  **Command**: `node atlas.mjs type shapes` -> Check output.
2.  **Command**: `node atlas.mjs type set Interface shape hexagon` -> Verify legend and canvas update.
3.  **Scan**: Verify `Gateway` node (if created) appears correctly.
