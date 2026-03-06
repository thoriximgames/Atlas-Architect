# Plan: Automatic Browser Preview for Atlas Architect

## Objective
Update the Atlas Architect engine to automatically open the default web browser to the visualizer URL when the server starts, providing an immediate preview for the user.

## Background & Motivation
Currently, when a user starts the Atlas service (via `atlas.mjs serve`, `atlas.mjs launch`, or direct scripts), they must manually navigate to `http://localhost:PORT/viewer/`. Automating this step improves the developer experience and aligns with modern development tools.

## Scope & Impact
- **Affected File:** `src/index.ts`
- **Impact:** Every time the Atlas engine starts in server mode (not CLI/Scan mode), it will trigger the default OS browser to open the viewer.

## Proposed Solution
Modify `src/index.ts` to:
1. Import `exec` from `child_process`.
2. In the `app.listen` callback, determine the OS-specific command to open a URL (`start` for Windows, `open` for macOS, `xdg-open` for Linux).
3. Execute the command to open `http://localhost:${port}/viewer/`.
4. Ensure this only happens when the engine is not in CLI mode (i.e., not a scan-only or slice operation).

## Implementation Steps
1. **Research:** Confirm `child_process.exec` usage and cross-platform commands. (Completed)
2. **Draft Change:** 
   - Add `import { exec } from 'child_process';` to imports.
   - Update `app.listen` callback logic.
3. **Verification:**
   - Run `npm run build` to compile the changes.
   - Run `node atlas.mjs start` and verify the browser opens.
   - Run `node atlas.mjs scan` and verify the browser DOES NOT open.

## Verification & Testing
- **Manual Test (Start):** Execute `node atlas.mjs start` in the repository. Expectation: The browser opens to the correct port.
- **Manual Test (Scan):** Execute `node atlas.mjs scan`. Expectation: The scan completes without opening a browser.
- **Manual Test (Launch):** Execute `node atlas.mjs launch`. Expectation: The background process eventually opens the browser.
