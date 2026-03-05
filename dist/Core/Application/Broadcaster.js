"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Broadcaster = void 0;
/**
 * Broadcaster: Manages connected clients and sends Server-Sent Events (SSE).
 */
class Broadcaster {
    clients = [];
    addClient(res) {
        this.clients.push(res);
        // Initial keep-alive
        res.write('data: {"type":"connected"}\n\n');
        res.on('close', () => {
            this.clients = this.clients.filter(c => c !== res);
        });
    }
    broadcast(type, data = {}) {
        const payload = JSON.stringify({ type, ...data });
        console.log(`[Broadcaster] Broadcasting: ${type}`);
        this.clients.forEach(res => {
            res.write(`data: ${payload}\n\n`);
        });
    }
}
exports.Broadcaster = Broadcaster;
