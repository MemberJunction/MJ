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
  standalone: false,
    selector: 'mj-weburl-config-panel',
    templateUrl: './weburl-config-panel.component.html',
    styleUrls: ['./config-panel.component.css']
})
export class WebURLConfigPanelComponent extends BaseConfigPanel {
    // Form fields
    public title = '';
    public Url = '';

    /** @deprecated Use {@link Url}. */
    public get url() {
      return this.Url;
    }
    /** @deprecated Use {@link Url}. */
    public set url(value) {
      this.Url = value;
    }
    public SandboxMode: 'standard' | 'strict' | 'permissive' = 'standard';

    /** @deprecated Use {@link SandboxMode}. */
    public get sandboxMode(): 'standard' | 'strict' | 'permissive' {
      return this.SandboxMode;
    }
    /** @deprecated Use {@link SandboxMode}. */
    public set sandboxMode(value: 'standard' | 'strict' | 'permissive') {
      this.SandboxMode = value;
    }
    public AllowFullscreen = true;

    /** @deprecated Use {@link AllowFullscreen}. */
    public get allowFullscreen() {
      return this.AllowFullscreen;
    }
    /** @deprecated Use {@link AllowFullscreen}. */
    public set allowFullscreen(value) {
      this.AllowFullscreen = value;
    }
    public RefreshOnResize = false;

    /** @deprecated Use {@link RefreshOnResize}. */
    public get refreshOnResize() {
      return this.RefreshOnResize;
    }
    /** @deprecated Use {@link RefreshOnResize}. */
    public set refreshOnResize(value) {
      this.RefreshOnResize = value;
    }

    // Validation
    public UrlError = '';

    /** @deprecated Use {@link UrlError}. */
    public get urlError() {
      return this.UrlError;
    }
    /** @deprecated Use {@link UrlError}. */
    public set urlError(value) {
      this.UrlError = value;
    }
    public ShowUrlPreview = false;

    /** @deprecated Use {@link ShowUrlPreview}. */
    public get showUrlPreview() {
      return this.ShowUrlPreview;
    }
    /** @deprecated Use {@link ShowUrlPreview}. */
    public set showUrlPreview(value) {
      this.ShowUrlPreview = value;
    }

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    public initFromConfig(config: PanelConfig | null): void {
        if (config && config.type === 'WebURL') {
            this.Url = (config['url'] as string) || '';
            this.SandboxMode = (config['sandboxMode'] as 'standard' | 'strict' | 'permissive') || 'standard';
            this.AllowFullscreen = (config['allowFullscreen'] as boolean) ?? true;
            this.RefreshOnResize = (config['refreshOnResize'] as boolean) ?? false;
        } else {
            // Defaults for new WebURL panel
            this.Url = '';
            this.SandboxMode = 'standard';
            this.AllowFullscreen = true;
            this.RefreshOnResize = false;
        }

        this.title = this.panel?.title || '';
        this.UrlError = '';
        this.ShowUrlPreview = this.Url ? this.isValidUrl(this.Url) : false;
        this.cdr.detectChanges();
    }

    public buildConfig(): PanelConfig {
        return {
            type: 'WebURL',
            url: this.Url.trim(),
            sandboxMode: this.SandboxMode,
            allowFullscreen: this.AllowFullscreen,
            refreshOnResize: this.RefreshOnResize
        };
    }

    public override validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        this.UrlError = '';

        if (!this.Url.trim()) {
            this.UrlError = 'URL is required';
            errors.push(this.UrlError);
        } else if (!this.isValidUrl(this.Url.trim())) {
            this.UrlError = 'Please enter a valid URL (e.g., https://example.com)';
            errors.push(this.UrlError);
        }

        this.cdr.detectChanges();
        return { valid: errors.length === 0, errors };
    }

    public getDefaultTitle(): string {
        if (this.Url) {
            try {
                const hostname = new URL(this.Url).hostname;
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
    public OnTitleChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnTitleChange}. */
    public onTitleChange(): void {
      return this.OnTitleChange();
    }

    public OnUrlChange(): void {
        this.UrlError = '';
        this.ShowUrlPreview = false;

        if (this.Url.trim() && this.isValidUrl(this.Url.trim())) {
            this.ShowUrlPreview = true;
            // Update title if it's still empty
            if (!this.title) {
                this.title = this.getDefaultTitle();
            }
        }

        this.emitConfigChanged();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnUrlChange}. */
    public onUrlChange(): void {
      return this.OnUrlChange();
    }

    public OnSandboxModeChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnSandboxModeChange}. */
    public onSandboxModeChange(): void {
      return this.OnSandboxModeChange();
    }

    public OnOptionChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnOptionChange}. */
    public onOptionChange(): void {
      return this.OnOptionChange();
    }

    public PreviewUrl(): void {
        if (this.Url && this.isValidUrl(this.Url)) {
            window.open(this.Url, '_blank', 'noopener,noreferrer');
        }
    }

    /** @deprecated Use {@link PreviewUrl}. */
    public previewUrl(): void {
      return this.PreviewUrl();
    }

    private isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    public GetSandboxModeDescription(): string {
        switch (this.SandboxMode) {
            case 'strict':
                return 'Only allows scripts to run. Most secure but may break some sites.';
            case 'permissive':
                return 'Allows most features including popups and navigation. Use with trusted sites only.';
            default:
                return 'Allows scripts, forms, and popups. Good balance of security and compatibility.';
        }
    }

    /** @deprecated Use {@link GetSandboxModeDescription}. */
    public getSandboxModeDescription(): string {
      return this.GetSandboxModeDescription();
    }
}
