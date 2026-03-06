# Plan: Improve Architectural Type Detection and Language Metadata

## Objective
Enhance the Atlas Architect's ability to automatically detect the `NodeType` (System, Service, Logic, etc.) and consistently report the `language` (TypeScript, C#, etc.) for all scanned nodes.

## Background & Motivation
Currently, many nodes default to `Unknown` or incorrect types because the detection heuristics are limited. Additionally, while the `BaseParser` has a `languageMap`, some nodes still appear with `Language: Unknown` in the visualizer and pipeline tasks, suggesting a gap in data propagation or fallback logic.

## Scope & Impact
- **Affected Files:**
  - `src/Core/Infrastructure/FileSystem/Parsers/BaseParser.ts`: Expand core heuristic logic and refine language mapping.
  - `src/Core/Infrastructure/FileSystem/Parsers/TsParser.ts`: Expand TypeScript-specific detection and ensure proper metadata extraction.
  - `src/pipeline.ts`: Ensure language metadata is correctly passed to generated tasks.
  - `viewer/src/main.ts`: Verify the visualizer correctly receives and displays language information.

## Proposed Solution

### 1. Robust NodeType Detection
Update `BaseParser.determineType` and subclasses with a more comprehensive keyword and pattern-matching system.
- **System:** Engine, Heartbeat, Broadcaster, Registry, Runner, Host, Server, Application, Gateway.
- **Service:** Service, Provider, Client, API.
- **Logic:** Strategy, Builder, Factory, Calculator, Parser, Processor, Validator, Manager, Controller.
- **Utility:** Helper, Utils, Common, Shared, Extensions, Tools.
- **Interface:** Handle naming conventions (`ISomeName`) and explicit syntax (`interface X`).

### 2. Reliable Language Reporting
- Ensure `BaseParser.parse` always returns a valid language string derived from the file extension.
- Update `languageMap` to be more comprehensive.
- Investigate why some nodes report "Unknown" language and fix the fallback logic.

### 3. Unified "Type • Language" Display
- Ensure the visualizer consistently displays the format `NodeType • Language` (e.g., `System • TypeScript`).
- Update pipeline task generation to accurately reflect the implementation language.

## Implementation Steps
1. **Analyze Current Metadata Failures:** Identify why specific nodes (like `AtlasEngine`) have missing or incorrect metadata.
2. **Refine BaseParser heuristics:**
   - Expand the category keyword lists.
   - Improve the `languageMap` with more extensions and robust fallbacks.
3. **Enhance TsParser overrides:**
   - Add TS-specific keywords (e.g., `Broadcaster`, `Registry`).
   - Ensure `Interface` and `Data` (for `type` or `dto`) are correctly identified.
4. **Audit Pipeline Sync:** Update `src/pipeline.ts` to ensure `node.language` is always used when generating tasks.
5. **Validation:**
   - Run `node atlas.mjs scan` and inspect `reality.json`.
   - Verify `AtlasEngine` is `System • TypeScript`.
   - Verify `FileScanner` is `Logic • TypeScript`.
   - Verify `Broadcaster` is `System • TypeScript`.

## Verification & Testing
- **Manual Scan:** Execute `node atlas.mjs scan` in the Atlas Architect project.
- **Data Audit:** Check `.atlas/data/reality.json` for consistent `type` and `language` fields across all nodes.
- **UI Verification:** Confirm the Inspector panel in the visualizer displays the correct `NodeType • Language` string for all selected nodes.
