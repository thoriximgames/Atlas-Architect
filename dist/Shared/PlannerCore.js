"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerCore = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
// Context Detection
const cwd = process.cwd();
let projectRoot = cwd;
if (path_1.default.basename(cwd) === '.atlas') {
    projectRoot = path_1.default.resolve(cwd, '..');
}
class PlannerCore {
    static getBlueprintPath(isPlanMode = false) {
        if (isPlanMode) {
            return path_1.default.join(projectRoot, '.atlas', 'data', 'plan.json');
        }
        return path_1.default.join(projectRoot, 'docs', 'topology', 'blueprint.json');
    }
    static async isLocked() {
        return await fs_extra_1.default.pathExists(this.getBlueprintPath(true));
    }
    static async loadBlueprint(isPlanMode = false) {
        const filePath = this.getBlueprintPath(isPlanMode);
        if (!await fs_extra_1.default.pathExists(filePath)) {
            return { plannedNodes: [] };
        }
        return await fs_extra_1.default.readJson(filePath);
    }
}
exports.PlannerCore = PlannerCore;
