export class ColorProvider {
    static getFunctionalColor(type, depth) {
        if (depth === 0)
            return '#FFFFFF';
        switch (type) {
            case 'Service': return '#00FF95';
            case 'System': return '#FF1F5E';
            case 'Component': return '#00E0FF';
            case 'Interface': return '#8b5cf6';
            case 'DTO': return '#f59e0b';
            default: return '#64748b';
        }
    }
}
