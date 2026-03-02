"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColorProvider = void 0;
class ColorProvider {
    static getFunctionalColor(type, depth, name) {
        if (name === '⚠️ UNCONNECTED')
            return '#450a0a'; // Deep Blood Red for Debris Root
        if (depth === 0)
            return '#1e293b'; // Dark Slate Blue for Roots
        switch (type) {
            case 'Service': return '#00FF95';
            case 'System': return '#FF1F5E';
            case 'Component': return '#00E0FF';
            case 'Interface': return '#8b5cf6';
            case 'DTO': return '#f59e0b';
            case 'Data': return '#f59e0b'; // Gold for Data/ScriptableObjects
            case 'Utility': return '#94a3b8'; // Muted blue for Editors
            case 'Logic': return '#64748b';
            default: return '#64748b';
        }
    }
}
exports.ColorProvider = ColorProvider;
