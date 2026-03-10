export class Toolbar {
    private btnRefresh: HTMLElement | null = null;
    private btnSync: HTMLElement | null = null;
    private activeStageLabel: HTMLElement | null = null;

    constructor(private onRefresh: () => Promise<void>, private onSync: () => Promise<void>) {
        this.btnRefresh = document.getElementById('btn-refresh-view');
        this.btnSync = document.getElementById('btn-sync-data');
        this.activeStageLabel = document.getElementById('active-stage-label');
        this.bindEvents();
    }

    setActiveStage(name: string) {
        if (!this.activeStageLabel) {
            console.warn("[Toolbar] Cannot set active stage: label element missing.");
            return;
        }
        
        if (name) {
            this.activeStageLabel.innerText = `ACTIVE STAGE: ${name}`;
            this.activeStageLabel.classList.remove('hidden');
        } else {
            this.activeStageLabel.classList.add('hidden');
        }
    }

    private bindEvents() {
        if (this.btnRefresh) {
            this.btnRefresh.addEventListener('click', async () => {
                if (!this.btnRefresh) return;
                this.setLoading(this.btnRefresh, true);
                try {
                    await this.onRefresh();
                } finally {
                    this.setLoading(this.btnRefresh, false);
                }
            });
        }

        if (this.btnSync) {
            this.btnSync.addEventListener('click', async () => {
                if (!this.btnSync) return;
                if (confirm("Perform a full codebase rescan? This may take a few seconds.")) {
                    this.setLoading(this.btnSync, true);
                    try {
                        await this.onSync();
                    } finally {
                        this.setLoading(this.btnSync, false);
                    }
                }
            });
        }
    }

    private setLoading(btn: HTMLElement | null, isLoading: boolean) {
        if (!btn) return;
        const icon = btn.querySelector('svg');
        if (isLoading) {
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
            if (icon) icon.style.animation = 'spin 1s linear infinite';
        } else {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            if (icon) icon.style.animation = 'none';
        }
    }
}
