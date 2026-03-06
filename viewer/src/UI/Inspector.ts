import { VisualNode } from '../Protocol/VisualTypes';
import { ThemeManager } from '../Theme/ThemeManager';

export class Inspector {
    private el: HTMLElement;
    constructor() { this.el = document.getElementById('inspector-content')!; }
    render(node: VisualNode) {
        const style = ThemeManager.getStyle(node.type);
        let html = `
            <h2 class="node-title">${node.name}</h2>
            <div class="node-type-chip" style="display: flex; align-items: center; margin-bottom: 8px;">
                <div class="type-color-dot" style="width: 12px; height: 12px; border-radius: 50%; background: ${style.fill}; margin-right: 8px;"></div>
                <div class="type-label" style="text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; opacity: 0.8; font-weight: 600;">${node.type} ${node.language ? `• ${node.language}` : ''}</div>
            </div>
            <div class="file-path" style="font-family: monospace; font-size: 11px; opacity: 0.6; margin-bottom: 16px; word-break: break-all;">${node.id}</div>
            
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

            ${this.renderLayers(node)}

            ${node.purpose ? `
                <div class="inspector-section">
                    <h3 style="color: #60a5fa; font-size: 10px; margin-bottom: 4px;">FUNCTIONAL PURPOSE</h3>
                    <div class="node-purpose" style="font-size: 13px; line-height: 1.5; margin-bottom: 12px; border-left: 2px solid #60a5fa; padding-left: 10px;">${node.purpose}</div>
                </div>
            ` : ''}

            ${node.designIntent ? `
                <div class="inspector-section">
                    <h3 style="color: #fbbf24; font-size: 10px; margin-bottom: 4px;">DESIGN INTENT (AI CONTEXT)</h3>
                    <div class="node-intent" style="font-size: 13px; line-height: 1.5; margin-bottom: 12px; border-left: 2px solid #fbbf24; padding-left: 10px;">${node.designIntent}</div>
                </div>
            ` : `
                <div class="inspector-section">
                    <h3 style="color: #fbbf24; font-size: 10px; margin-bottom: 4px;">DESIGN INTENT (AI CONTEXT)</h3>
                    <div class="node-intent" style="font-size: 13px; line-height: 1.5; margin-bottom: 12px; border-left: 2px solid #ef4444; padding-left: 10px; color: #ef4444; font-style: italic;">⚠️ Missing AI Context (Design Intent not defined)</div>
                </div>
            `}

            ${node.description ? `
                <div class="inspector-section">
                    <h3 style="color: #a1a1aa; font-size: 10px; margin-bottom: 4px;">SOURCE DOCUMENTATION</h3>
                    <div class="node-description" style="font-size: 12px; line-height: 1.4; opacity: 0.8; margin-bottom: 12px;">${node.description}</div>
                </div>
            ` : `
                <div class="inspector-section">
                    <h3 style="color: #a1a1aa; font-size: 10px; margin-bottom: 4px;">SOURCE DOCUMENTATION</h3>
                    <div class="node-description" style="font-size: 12px; line-height: 1.4; margin-bottom: 12px; color: #ef4444; font-style: italic;">⚠️ Missing Source Documentation (No comments found)</div>
                </div>
            `}
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
    private renderLayers(node: VisualNode): string {
        let layersHtml = '';
        
        if (node.isAuthority) {
            layersHtml += this.createLayerChip('#FFCD29', 'AUTHORITATIVE SOURCE');
        }
        
        if (node.guardState === 'guarded') {
            layersHtml += this.createLayerChip('#FFCD29', 'GUARDIAN (STRICT)');
        } else if (node.guardState === 'restricted') {
            layersHtml += this.createLayerChip('#FFCD29', 'GUARDIAN (PERMISSIVE)');
        }
        
        if (node.type === 'Interface') {
            layersHtml += this.createLayerChip('#9747FF', 'PROTOCOL INTERFACE');
        }
        
        if (node.baseClasses && node.baseClasses.length > 0) {
            layersHtml += this.createLayerChip('#A259FF', `INHERITANCE (${node.baseClasses.join(', ')})`);
        }

        if (!layersHtml) return '';

        return `
            <div class="inspector-section">
                <h3 style="color: #a855f7; font-size: 10px; margin-bottom: 8px;">SYSTEM LAYERS</h3>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${layersHtml}
                </div>
            </div>
        `;
    }

    private createLayerChip(color: string, label: string): string {
        return `
            <div style="display: flex; align-items: center; background: #3d3d3d; padding: 6px 10px; border-radius: 6px; border-left: 3px solid ${color};">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; margin-right: 10px;"></div>
                <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.02em; color: #fff;">${label}</div>
            </div>
        `;
    }

    clear() { this.el.innerHTML = '<div style="text-align:center;padding-top:100px;opacity:0.5;color:var(--text-mid);font-size:10px;text-transform:uppercase;letter-spacing:1px;">Select a node</div>'; }
}
