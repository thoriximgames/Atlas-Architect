export class Toolbar {
    private btnRefresh: HTMLElement | null = null;

    constructor(private onRefresh: () => Promise<void>) {
        this.btnRefresh = document.getElementById('btn-refresh-view');
        this.bindEvents();
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
