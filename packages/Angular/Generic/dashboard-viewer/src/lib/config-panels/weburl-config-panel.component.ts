import { Component, ChangeDetectorRef } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseConfigPanel } from './base-config-panel';
import { PanelConfig } from '../models/dashboard-types';

/**
 * Configuration panel for WebURL parts.
 * Contains only the form content - no dialog chrome.
 */
@RegisterClass(BaseConfigPanel, 'WebURLPanelConfigDialog')
@Component({
    selector: 'mj-weburl-config-panel',
    templateUrl: './weburl-config-panel.component.html',
    styleUrls: ['./config-panel.component.css']
})
export class WebURLConfigPanelComponent extends BaseConfigPanel {
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

    public initFromConfig(config: PanelConfig | null): void {
        if (config && config.type === 'WebURL') {
            this.url = (config['url'] as string) || '';
            this.sandboxMode = (config['sandboxMode'] as 'standard' | 'strict' | 'permissive') || 'standard';
            this.allowFullscreen = (config['allowFullscreen'] as boolean) ?? true;
            this.refreshOnResize = (config['refreshOnResize'] as boolean) ?? false;
        } else {
            // Defaults for new WebURL panel
            this.url = '';
            this.sandboxMode = 'standard';
            this.allowFullscreen = true;
            this.refreshOnResize = false;
        }

        this.title = this.panel?.title || '';
        this.urlError = '';
        this.showUrlPreview = this.url ? this.isValidUrl(this.url) : false;
        this.cdr.detectChanges();
    }

    public buildConfig(): PanelConfig {
        return {
            type: 'WebURL',
            url: this.url.trim(),
            sandboxMode: this.sandboxMode,
            allowFullscreen: this.allowFullscreen,
            refreshOnResize: this.refreshOnResize
        };
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

    public getTitle(): string {
        return this.title || this.getDefaultTitle();
    }

    // Form event handlers
    public onTitleChange(): void {
        this.emitConfigChanged();
    }

    public onUrlChange(): void {
        this.urlError = '';
        this.showUrlPreview = false;

        if (this.url.trim() && this.isValidUrl(this.url.trim())) {
            this.showUrlPreview = true;
            // Update title if it's still empty
            if (!this.title) {
                this.title = this.getDefaultTitle();
            }
        }

        this.emitConfigChanged();
        this.cdr.detectChanges();
    }

    public onSandboxModeChange(): void {
        this.emitConfigChanged();
    }

    public onOptionChange(): void {
        this.emitConfigChanged();
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
