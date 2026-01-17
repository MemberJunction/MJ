import { Component, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseConfigDialog } from './base-config-dialog';
import { PanelConfig, WebURLPanelConfig, createDefaultWebURLPanelConfig } from '../models/dashboard-types';

/**
 * Configuration dialog for WebURL parts.
 * Allows setting URL, security mode, and display options.
 */
@RegisterClass(BaseConfigDialog, 'WebURLPanelConfigDialog')
@Component({
    selector: 'mj-weburl-config-dialog',
    templateUrl: './weburl-config-dialog.component.html',
    styleUrls: ['./config-dialog.component.css']
})
export class WebURLConfigDialogComponent extends BaseConfigDialog implements OnChanges {
    // Form fields
    public title = '';
    public url = '';
    public sandboxMode: 'standard' | 'strict' | 'permissive' = 'standard';
    public allowFullscreen = true;
    public refreshOnResize = false;

    // Validation
    public urlError = '';
    public showUrlPreview = false;

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['config'] || changes['panel']) {
            this.initFromConfig(this.config);
        }
    }

    public initFromConfig(config: PanelConfig | null): void {
        if (config && config.type === 'WebURL') {
            const webConfig = config as WebURLPanelConfig;
            this.url = webConfig.url || '';
            this.sandboxMode = webConfig.sandboxMode || 'standard';
            this.allowFullscreen = webConfig.allowFullscreen ?? true;
            this.refreshOnResize = webConfig.refreshOnResize ?? false;
        } else {
            const defaults = createDefaultWebURLPanelConfig();
            this.url = defaults.url;
            this.sandboxMode = defaults.sandboxMode;
            this.allowFullscreen = defaults.allowFullscreen;
            this.refreshOnResize = defaults.refreshOnResize;
        }

        this.title = this.panel?.title || this.getDefaultTitle();
        this.urlError = '';
        this.showUrlPreview = false;
        this.cdr.detectChanges();
    }

    public buildConfig(): PanelConfig {
        return {
            type: 'WebURL',
            url: this.url.trim(),
            sandboxMode: this.sandboxMode,
            allowFullscreen: this.allowFullscreen,
            refreshOnResize: this.refreshOnResize
        } as WebURLPanelConfig;
    }

    public override validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        this.urlError = '';

        if (!this.url.trim()) {
            this.urlError = 'URL is required';
            errors.push(this.urlError);
        } else if (!this.isValidUrl(this.url.trim())) {
            this.urlError = 'Please enter a valid URL (e.g., https://example.com)';
            errors.push(this.urlError);
        }

        this.cdr.detectChanges();
        return { valid: errors.length === 0, errors };
    }

    public getDefaultTitle(): string {
        if (this.url) {
            try {
                const hostname = new URL(this.url).hostname;
                return hostname || 'Web Page';
            } catch {
                return 'Web Page';
            }
        }
        return 'Web Page';
    }

    protected override getTitle(): string {
        return this.title || this.getDefaultTitle();
    }

    // URL validation
    public onUrlChange(): void {
        this.urlError = '';
        this.showUrlPreview = false;

        if (this.url.trim() && this.isValidUrl(this.url.trim())) {
            this.showUrlPreview = true;
            // Update title if it's still the default
            if (!this.title || this.title === 'Web Page') {
                this.title = this.getDefaultTitle();
            }
        }

        this.cdr.detectChanges();
    }

    public previewUrl(): void {
        if (this.url && this.isValidUrl(this.url)) {
            window.open(this.url, '_blank', 'noopener,noreferrer');
        }
    }

    private isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    public getSandboxModeDescription(): string {
        switch (this.sandboxMode) {
            case 'strict':
                return 'Only allows scripts to run. Most secure but may break some sites.';
            case 'permissive':
                return 'Allows most features including popups and navigation. Use with trusted sites only.';
            default:
                return 'Allows scripts, forms, and popups. Good balance of security and compatibility.';
        }
    }
}
