import { Component, ChangeDetectorRef, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboardPart } from './base-dashboard-part';
import { WebURLPanelConfig } from '../models/dashboard-types';

/**
 * Runtime renderer for WebURL dashboard parts.
 * Displays web content in an iframe with configurable sandbox permissions.
 */
@RegisterClass(BaseDashboardPart, 'WebURLPanelRenderer')
@Component({
    selector: 'mj-weburl-part',
    template: `
        <div class="weburl-part" [class.loading]="IsLoading" [class.error]="ErrorMessage">
            <!-- Loading state -->
            <div class="loading-state" *ngIf="IsLoading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Loading...</span>
            </div>

            <!-- Error state -->
            <div class="error-state" *ngIf="ErrorMessage">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <span>{{ ErrorMessage }}</span>
            </div>

            <!-- No URL configured -->
            <div class="empty-state" *ngIf="!IsLoading && !ErrorMessage && !url">
                <i class="fa-solid fa-globe"></i>
                <h4>No URL Configured</h4>
                <p>Click the configure button to set a URL for this part.</p>
            </div>

            <!-- Iframe container -->
            <iframe
                *ngIf="!IsLoading && !ErrorMessage && url"
                #iframe
                [src]="url"
                [attr.sandbox]="sandboxValue"
                [attr.allowfullscreen]="allowFullscreen ? '' : null"
                [title]="Panel?.title || 'Embedded content'"
                class="content-iframe">
            </iframe>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
        }

        .weburl-part {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            background: #fff;
        }

        .loading-state,
        .error-state,
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #666;
            text-align: center;
            padding: 24px;
        }

        .loading-state i,
        .error-state i,
        .empty-state i {
            font-size: 48px;
            color: #ccc;
            margin-bottom: 16px;
        }

        .error-state i {
            color: #d32f2f;
        }

        .empty-state h4 {
            margin: 0 0 8px 0;
            color: #333;
        }

        .empty-state p {
            margin: 0;
            font-size: 13px;
        }

        .content-iframe {
            width: 100%;
            height: 100%;
            border: none;
            flex: 1;
        }
    `]
})
export class WebURLPartComponent extends BaseDashboardPart implements AfterViewInit {
    @ViewChild('iframe') iframeRef!: ElementRef<HTMLIFrameElement>;

    public url: string = '';
    public sandboxValue: string = '';
    public allowFullscreen: boolean = true;

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngAfterViewInit(): void {
        // Initial load if panel is already set
        if (this.Panel) {
            this.loadContent();
        }
    }

    public async loadContent(): Promise<void> {
        const config = this.getConfig<WebURLPanelConfig>();

        if (!config?.url) {
            this.url = '';
            this.cdr.detectChanges();
            return;
        }

        this.setLoading(true);

        try {
            // Set URL
            this.url = config.url;

            // Determine sandbox permissions based on mode
            this.sandboxValue = this.getSandboxValue(config.sandboxMode || 'standard');

            // Set fullscreen permission
            this.allowFullscreen = config.allowFullscreen ?? true;

            this.setLoading(false);
        } catch (error) {
            this.setError(error instanceof Error ? error.message : 'Failed to load URL');
        }
    }

    private getSandboxValue(mode: 'standard' | 'strict' | 'permissive'): string {
        switch (mode) {
            case 'strict':
                return 'allow-scripts';
            case 'permissive':
                return 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation';
            default:
                return 'allow-scripts allow-same-origin allow-forms allow-popups';
        }
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadWebURLPart() {
    // Prevents tree-shaking of the component
}
