import { NodeType } from '../../../src/Shared/Protocol';

export interface NodeStyle {
    fill: string;
    stroke: string;
    text: string;
}

export class ThemeManager {
    private static styles: Record<string, NodeStyle> = {
        'System': { fill: '#FFD5D2', stroke: 'rgba(0,0,0,0.15)', text: '#000000' },
        'Service': { fill: '#D3F5E3', stroke: 'rgba(0,0,0,0.15)', text: '#000000' },
        'Component': { fill: '#D3E5FF', stroke: 'rgba(0,0,0,0.15)', text: '#000000' },
        'Interface': { fill: '#EBDDFF', stroke: 'rgba(0,0,0,0.15)', text: '#000000' },
        'DTO': { fill: '#FFF1CC', stroke: 'rgba(0,0,0,0.15)', text: '#000000' },
        'Data': { fill: '#FFF1CC', stroke: 'rgba(0,0,0,0.15)', text: '#000000' },
        'Utility': { fill: '#F1F3F5', stroke: 'rgba(0,0,0,0.15)', text: '#000000' },
        'Logic': { fill: '#F1F3F5', stroke: 'rgba(0,0,0,0.15)', text: '#000000' },
        'Unknown': { fill: '#450a0a', stroke: 'rgba(255,255,255,0.1)', text: '#ffffff' } // Debris/Orphans
    };

    static getStyle(type: NodeType | string): NodeStyle {
        return this.styles[type] || this.styles['Logic'];
    }

    static get backgroundColor(): string { return '#F8F9FA'; }
    static get gridColor(): string { return 'rgba(0, 0, 0, 0.08)'; }
}
