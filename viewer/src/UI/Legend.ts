export class Legend {
    private el: HTMLElement;
    
    constructor() {
        this.el = document.getElementById('legend-container')!;
    }

    render() {
        const items = [
            { label: 'ROOT / SYSTEM', color: '#1e293b', desc: 'Entry Point / Master Logic' },
            { label: 'SERVICE', color: '#00FF95', desc: 'Global Singletons' },
            { label: 'LOGIC / WORKER', color: '#FF1F5E', desc: 'Active Logic Unit' },
            { label: 'COMPONENT', color: '#00E0FF', desc: 'UI / visual element' },
            { label: 'INTERFACE', color: '#8b5cf6', desc: 'Contract definitions' },
            { label: 'DATA / ASSET', color: '#f59e0b', desc: 'ScriptableObject / DTO' },
            { label: 'UTILITY / EDITOR', color: '#94a3b8', desc: 'Tools and Helpers' },
            { label: 'UNCONNECTED', color: '#450a0a', desc: 'Dead Code / Debris' }
        ];

        this.el.innerHTML = `
            <div class="info-map-header">NODE CLASSIFICATIONS</div>
            <div class="info-map-grid">
                ${items.map(item => `
                    <div class="info-map-item">
                        <div class="info-map-color" style="background: ${item.color}"></div>
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
            </div>
        `;
    }
}
