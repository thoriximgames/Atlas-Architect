import { NodeTypesConfig, NodeShape } from '../../../src/Shared/NodeTypeConfig';

export interface NodeStyle {
    fill: string;
    stroke: string;
    text: string;
    shape: NodeShape;
}

export class ThemeManager {
    private static styles: Record<string, NodeStyle> = {
        'Unknown': { fill: '#CCCCCC', stroke: '#888888', text: '#444444', shape: 'circle' }
    };

    static async loadConfig() {
        try {
            const response = await fetch('/api/config/node-types');
            if (response.ok) {
                const config: NodeTypesConfig = await response.json();
                for (const id in config) {
                    this.styles[id] = {
                        ...config[id].style,
                        shape: config[id].legend.shape
                    };
                }
            }
        } catch (e) {
            console.warn('[ThemeManager] Failed to load dynamic node types, using defaults.', e);
            // Fallback to minimal defaults if API fails
            this.styles = {
                'System': { fill: '#FFB8A8', stroke: '#F24822', text: '#444444', shape: 'square' },
                'Service': { fill: '#B3EFBD', stroke: '#14AE5C', text: '#444444', shape: 'hexagon' },
                'Component': { fill: '#A8DAFF', stroke: '#0D99FF', text: '#444444', shape: 'diamond' },
                'Interface': { fill: '#D3BDFF', stroke: '#9747FF', text: '#444444', shape: 'octagon' },
                'Data': { fill: '#FFE299', stroke: '#FFCD29', text: '#444444', shape: 'circle' },
                'Utility': { fill: '#E6E6E6', stroke: '#B3B3B3', text: '#444444', shape: 'circle' },
                'Logic': { fill: '#E6E6E6', stroke: '#B3B3B3', text: '#444444', shape: 'circle' },
                'Unknown': { fill: '#CCCCCC', stroke: '#888888', text: '#444444', shape: 'circle' }
            };
        }
    }

    static getStyle(type: string): NodeStyle {
        return this.styles[type] || this.styles['Unknown'];
    }

    static get backgroundColor(): string { return '#EBEBEB'; }
    static get gridColor(): string { return '#BBBBBB'; }
    
    static get connectorNormal(): string { return '#999999'; }
    static get connectorSelected(): string { return '#444444'; }
    static get selectionBlue(): string { return '#0D99FF'; } // FigJam Selection Blue
}
