import { Response } from 'express';

/**
 * Broadcaster: Manages connected clients and sends Server-Sent Events (SSE).
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
