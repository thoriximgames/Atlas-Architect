import { ThemeManager } from '../Theme/ThemeManager';

export class Legend {
    private el: HTMLElement;
    
    constructor() {
        this.el = document.getElementById('legend-container')!;
    }

    render() {
        const items = [
            { label: 'SYSTEM', type: 'System', desc: 'Core infrastructure / Foundations', shape: 'square' },
            { label: 'SERVICE', type: 'Service', desc: 'Global utility managers', shape: 'hexagon' },
            { label: 'COMPONENT', type: 'Component', desc: 'Modular logic plugins', shape: 'diamond' },
            { label: 'INTERFACE', type: 'Interface', desc: 'Protocol / Portal contract', shape: 'octagon' },
            { label: 'DATA / DTO', type: 'Data', desc: 'Atomic units / Templates', shape: 'circle' },
            { label: 'UTILITY', type: 'Utility', desc: 'Tools and Helpers', shape: 'circle' },
            { label: 'DEBRIS', type: 'Unknown', desc: 'Unconnected / Dead code', shape: 'circle' }
        ];

        this.el.innerHTML = `
            <div class="info-map-header">FUNCTIONAL GEOMETRY</div>
            <div class="info-map-grid">
                ${items.map(item => `
                    <div class="info-map-item">
                        ${this.renderLegendShape(ThemeManager.getStyle(item.type).fill, item.shape)}
                        <div class="info-map-text">
                            <div class="info-map-label">${item.label}</div>
                            <div class="info-map-desc">${item.desc}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="info-map-header" style="margin-top: 20px;">CONNECTION TYPES</div>
            <div class="info-map-grid">
                <div class="info-map-item">
                    <div class="info-map-line solid"></div>
                    <div class="info-map-text">
                        <div class="info-map-label">PRIMARY HIERARCHY</div>
                        <div class="info-map-desc">Direct ownership / Parent-Child</div>
                    </div>
                </div>
                <div class="info-map-item">
                    <div class="info-map-line dotted"></div>
                    <div class="info-map-text">
                        <div class="info-map-label">CROSS-DEPENDENCY</div>
                        <div class="info-map-desc">Import / External reference</div>
                    </div>
                </div>
            </div>
            <div class="info-map-header" style="margin-top: 20px;">NODE STATUS</div>
            <div class="info-map-grid">
                <div class="info-map-item">
                    <div class="info-map-ghost"></div>
                    <div class="info-map-text">
                        <div class="info-map-label">GHOST NODE</div>
                        <div class="info-map-desc">Planned (Not yet implemented)</div>
                    </div>
                </div>
                <div class="info-map-item">
                    <div class="info-map-color" style="background: #71717a; width: 20px; height: 2px; margin-right: 10px;"></div>
                    <div class="info-map-text">
                        <div class="info-map-label">DISCOVERED NODE</div>
                        <div class="info-map-desc">Found in code (Unplaced)</div>
                    </div>
                </div>
            </div>
        `;
    }

    private renderLegendShape(color: string, shape: string): string {
        const size = 16;
        const center = size / 2;
        const r = size / 2 - 2;
        let path = '';

        switch (shape) {
            case 'square':
                path = `M 2,2 L ${size-2},2 L ${size-2},${size-2} L 2,${size-2} Z`;
                break;
            case 'hexagon':
                const hPoints = [];
                for (let i = 0; i < 6; i++) {
                    const angle = (i * 60) * (Math.PI / 180);
                    hPoints.push(`${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`);
                }
                path = `M ${hPoints.join(' L ')} Z`;
                break;
            case 'diamond':
                path = `M ${center},2 L ${size-2},${center} L ${center},${size-2} L 2,${center} Z`;
                break;
            case 'octagon':
                const oPoints = [];
                for (let i = 0; i < 8; i++) {
                    const angle = (i * 45 + 22.5) * (Math.PI / 180);
                    oPoints.push(`${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`);
                }
                path = `M ${oPoints.join(' L ')} Z`;
                break;
            default: // circle
                return `<div class="info-map-color" style="background: ${color}; border-radius: 50%;"></div>`;
        }

        return `
            <div class="info-map-color" style="background: none; border: none; display: flex; align-items: center; justify-content: center;">
                <svg width="${size}" height="${size}">
                    <path d="${path}" fill="${color}" stroke="rgba(0,0,0,0.3)" stroke-width="1" />
                </svg>
            </div>
        `;
    }
}
