# Atlas Architect: Production-Ready Setup Guide

Welcome to **Atlas Architect (vUniversal)**. This guide covers the initial setup for both the Atlas Engine and the Gemini CLI Skill integration.

---

## 🚀 1. Atlas Engine Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher.
- **Git**: For version control integration.

### Installation
1.  **Clone the Repository**:
    ```powershell
    git clone https://github.com/thoriximgames/Atlas-Architect.git E:\GIT\Atlas-Architect
    ```
2.  **Install Dependencies**:
    ```powershell
    cd E:\GIT\Atlas-Architect
    npm install
    cd viewer
    npm install
    ```
3.  **Perform Initial Build**:
    ```powershell
    cd E:\GIT\Atlas-Architect
    node atlas.mjs build
    ```

---

## 🤖 2. Gemini CLI Skill Setup

To enable the specialized **`atlas-architect`** skill in your Gemini CLI, follow these steps:

### Step 1: Create the Skill Directory
Gemini looks for skills in your user profile. Create the following folder:
```powershell
mkdir "$HOME\.gemini\skills\atlas-architect"
```

### Step 2: Link the Skill File
Copy (or symlink) the `SKILL.md` from the Atlas repository to the Gemini skills folder:
```powershell
copy "E:\GIT\Atlas-Architect\SKILL.md" "$HOME\.gemini\skills\atlas-architect\SKILL.md"
```

### Step 3: Activation
In any Gemini CLI session, you can now activate the skill by typing:
> "activate atlas-architect skill"

---

## 🛠️ 3. Initializing a New Project

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
