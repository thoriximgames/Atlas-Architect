# Atlas Architect: Production-Ready Setup Guide

Welcome to **Atlas Architect (vUniversal)**. This guide covers the initial setup for both the Atlas Engine and the Gemini CLI Skill integration.

---

## 🚀 1. Atlas Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher.
- **Git**: For version control integration.

### Quick Setup
We have provided automated scripts that will install all backend and frontend dependencies, compile the engine, and automatically synchronize the `atlas-architect` skill with your global Gemini CLI environment.

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/thoriximgames/Atlas-Architect.git
    cd Atlas-Architect
    ```
2.  **Run the Installer**:
    - **Windows**: Double-click `install.bat` or run it in the terminal.
    - **Mac/Linux**: Run `./install.sh` (you may need to run `chmod +x install.sh` first).

*That's it!* The engine is built and the Gemini skill is now active on your machine.

---

## 🛠️ 2. Initializing a New Project
To turn any directory into an Atlas-managed project:
1.  Navigate to your project root.
2.  Run the initialization command:
    ```powershell
    node E:\GIT\Atlas-Architect\atlas.mjs init
    ```
3.  Atlas will create a `.atlas/` footprint and a `docs/topology/` directory.

---

## 📖 4. Core Workflow (The "Iron Loop")

1.  **`atlas.mjs serve`**: Start the background engine and visualizer.
2.  **`atlas.mjs plan start`**: Begin an architectural drafting session.
3.  **`atlas.mjs plan add <id> <name> <type> <purpose> [parent]`**: Register a "Ghost Node" (Intent). 
    - *Note:* The `<id>` must match the intended relative file path (e.g. `src/Main`).
4.  **Implement Code**: Create the physical files. Atlas will automatically detect them via SSE and turn the Ghost Nodes solid.
5.  **`atlas.mjs plan merge`**: Commit your implemented design to the authoritative blueprint (this will block if any Ghost Nodes remain).
6.  **`atlas.mjs scan`**: Force a final re-scan to ensure perfect alignment.

---

## ⚖️ The Iron Law
**Never modify a file until its Node is registered in the Blueprint.** Architecture is the source of truth; code is the implementation of that truth.
