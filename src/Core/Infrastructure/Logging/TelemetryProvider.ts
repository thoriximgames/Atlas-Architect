import fs from 'fs-extra';
import path from 'path';

/**
 * TelemetryProvider: Centralized logging and telemetry service.
 * Registered Atlas ID: src/Core/Infrastructure/Logging/TelemetryProvider
 */
export class TelemetryProvider {
    private logPath: string;

    constructor(projectRoot: string) {
        this.logPath = path.join(projectRoot, 'atlas_debug.log');
    }

    async log(message: string, context: string = 'SYSTEM'): Promise<void> {
        const timestamp = new Date().toISOString();
        const entry = `[${timestamp}] [${context}] ${message}\n`;
        
        try {
            await fs.appendFile(this.logPath, entry);
            console.log(`[Telemetry] ${entry.trim()}`);
        } catch (err) {
            console.error(`[Telemetry Error] Failed to write to log: ${err}`);
        }
    }

    async heartbeat(): Promise<void> {
        await this.log('Heartbeat pulse recorded', 'HEARTBEAT');
    }
}
