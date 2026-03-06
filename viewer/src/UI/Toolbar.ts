export class Toolbar {
    private btnSync: HTMLElement;
    private activeStageLabel: HTMLElement;

    constructor(private onSync: () => Promise<void>) {
        this.btnSync = document.getElementById('btn-sync-data')!;
        this.activeStageLabel = document.getElementById('active-stage-label')!;
        this.bindEvents();
    }

    setActiveStage(name: string) {
        if (name) {
            this.activeStageLabel.innerText = `ACTIVE STAGE: ${name}`;
            this.activeStageLabel.classList.remove('hidden');
        } else {
            this.activeStageLabel.classList.add('hidden');
        }
    }

    private bindEvents() {
        this.btnSync?.addEventListener('click', async () => {
            this.setLoading(true);
            try {
                await this.onSync();
            } finally {
                this.setLoading(false);
            }
        });
    }

    private setLoading(isLoading: boolean) {
        if (!this.btnSync) return;
        const icon = this.btnSync.querySelector('svg');
        if (isLoading) {
            this.btnSync.style.opacity = '0.5';
            this.btnSync.style.pointerEvents = 'none';
            if (icon) icon.style.animation = 'spin 1s linear infinite';
        } else {
            this.btnSync.style.opacity = '1';
            this.btnSync.style.pointerEvents = 'auto';
            if (icon) icon.style.animation = 'none';
        }
    }
}
