import { VisualNode } from '../Protocol/VisualTypes';

export class Inspector {
    private el: HTMLElement;
    constructor() { this.el = document.getElementById('inspector-content')!; }
    render(node: VisualNode) {
        let html = `
            <h2 class="node-title">${node.name}</h2>
            <div class="file-path">${node.id}</div>
            
            ${node.description ? `<div class="node-description">${node.description}</div>` : ''}

            <div class="stat-grid">
                <div class="stat-card">
                    <div class="stat-label">Hierarchy</div>
                    <div class="stat-value">LVL ${node.depth}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Mass</div>
                    <div class="stat-value">${node.descendantCount}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Complexity</div>
                    <div class="stat-value">${node.complexity}</div>
                </div>
            </div>
        `;

        if (node.methods && node.methods.length > 0) {
            html += `<div class="inspector-section">
                <h3>Methods</h3>
                <div class="definition-list">
                    ${node.methods.map(m => `
                        <div class="definition-item">
                            <span class="visibility ${m.visibility}">${m.visibility[0]}</span>
                            <span class="return-type">${m.returnType}</span>
                            <span class="name">${m.name}</span>
                            <span class="params">(${m.params.join(', ')})</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        if (node.fields && node.fields.length > 0) {
            html += `<div class="inspector-section">
                <h3>Fields</h3>
                <div class="definition-list">
                    ${node.fields.map(f => `
                        <div class="definition-item">
                            <span class="visibility ${f.visibility}">${f.visibility[0]}</span>
                            <span class="type">${f.type}</span>
                            <span class="name">${f.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        this.el.innerHTML = html;
    }
    clear() { this.el.innerHTML = '<div style="text-align:center;padding-top:100px;opacity:0.5">Select a node</div>'; }
}
