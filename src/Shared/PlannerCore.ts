import fs from 'fs-extra';
import path from 'path';

// Context Detection
const cwd = process.cwd();
let projectRoot = cwd;
if (path.basename(cwd) === '.atlas') {
    projectRoot = path.resolve(cwd, '..');
}

export class PlannerCore {
    static getBlueprintPath(isPlanMode: boolean = false): string {
        if (isPlanMode) {
            return path.join(projectRoot, '.atlas', 'data', 'plan.json');
        }
        return path.join(projectRoot, 'docs', 'topology', 'blueprint.json');
    }

    static async isLocked(): Promise<boolean> {
        return await fs.pathExists(this.getBlueprintPath(true));
    }

    static async loadBlueprint(isPlanMode: boolean = false) {
        const filePath = this.getBlueprintPath(isPlanMode);
        if (!await fs.pathExists(filePath)) {
            return { plannedNodes: [] };
        }
        return await fs.readJson(filePath);
    }
}
