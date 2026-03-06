import { Response } from 'express';

/**
 * Broadcaster: Real-time synchronization hub.
 * 
 * DESIGN INTENT:
 * Provides the "Nervous System" of the Atlas service. It enables immediate 
 * feedback loops by pushing server-side events (SSE) to all connected visualizers. 
 * It ensures that when a scan completes or a command is issued, the UI reflects 
 * the new state without a manual refresh.
 * 
 * KEY RESPONSIBILITIES:
 * 1. Manages a registry of active Server-Sent Events (SSE) client connections.
 * 2. Provides a simplified broadcast interface for system-wide event propagation.
 * 3. Handles initial keep-alive signals and automatic client cleanup on disconnect.
 */
export class Broadcaster {
    private clients: Response[] = [];

    addClient(res: Response) {
        this.clients.push(res);
        
        // Initial keep-alive
        res.write('data: {"type":"connected"}\n\n');

        res.on('close', () => {
            this.clients = this.clients.filter(c => c !== res);
        });
    }

    broadcast(type: string, data: any = {}) {
        const payload = JSON.stringify({ type, ...data });
        console.log(`[Broadcaster] Broadcasting: ${type}`);
        this.clients.forEach(res => {
            res.write(`data: ${payload}\n\n`);
        });
    }
}
