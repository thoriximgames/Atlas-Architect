"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryProvider = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
/**
 * TelemetryProvider: Centralized logging and telemetry service.
 * Registered Atlas ID: src/Core/Infrastructure/Logging/TelemetryProvider
 */
class TelemetryProvider {
    logPath;
    constructor(projectRoot) {
        this.logPath = path_1.default.join(projectRoot, 'atlas_debug.log');
    }
    async log(message, context = 'SYSTEM') {
        const timestamp = new Date().toISOString();
        const entry = `[${timestamp}] [${context}] ${message}\n`;
        try {
            await fs_extra_1.default.appendFile(this.logPath, entry);
            console.log(`[Telemetry] ${entry.trim()}`);
        }
        catch (err) {
            console.error(`[Telemetry Error] Failed to write to log: ${err}`);
        }
    }
    async heartbeat() {
        await this.log('Heartbeat pulse recorded', 'HEARTBEAT');
    }
}
exports.TelemetryProvider = TelemetryProvider;
