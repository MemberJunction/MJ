import { Component, ChangeDetectorRef, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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
            <div class="empty-state" *ngIf="!IsLoading && !ErrorMessage && !SafeUrl">
                <i class="fa-solid fa-globe"></i>
                <h4>No URL Configured</h4>
                <p>Click the configure button to set a URL for this part.</p>
            </div>

            <!-- Iframe container - sandbox must be static, so we use ng-container to switch -->
            <ng-container *ngIf="!IsLoading && !ErrorMessage && SafeUrl">
                <!-- Standard sandbox mode -->
                <iframe
                    *ngIf="sandboxMode === 'standard'"
                    #iframe
                    [src]="SafeUrl"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    [attr.allowfullscreen]="allowFullscreen ? '' : null"
                    [title]="Panel?.title || 'Embedded content'"
                    class="content-iframe">
                </iframe>
                <!-- Strict sandbox mode -->
                <iframe
                    *ngIf="sandboxMode === 'strict'"
                    #iframe
                    [src]="SafeUrl"
                    sandbox="allow-scripts"
                    [attr.allowfullscreen]="allowFullscreen ? '' : null"
                    [title]="Panel?.title || 'Embedded content'"
                    class="content-iframe">
                </iframe>
                <!-- Permissive sandbox mode -->
                <iframe
                    *ngIf="sandboxMode === 'permissive'"
                    #iframe
                    [src]="SafeUrl"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation"
                    [attr.allowfullscreen]="allowFullscreen ? '' : null"
                    [title]="Panel?.title || 'Embedded content'"
                    class="content-iframe">
                </iframe>
            </ng-container>
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

    public SafeUrl: SafeResourceUrl | null = null;
    public sandboxMode: 'standard' | 'strict' | 'permissive' = 'standard';
    public allowFullscreen: boolean = true;

    private sanitizer: DomSanitizer;

    constructor(cdr: ChangeDetectorRef, sanitizer: DomSanitizer) {
        super(cdr);
        this.sanitizer = sanitizer;
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
            this.SafeUrl = null;
            this.cdr.detectChanges();
            return;
        }

        this.setLoading(true);

        try {
            // Sanitize and set URL for iframe src binding
            this.SafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(config.url);

            // Set sandbox mode (used by template to select correct iframe)
            this.sandboxMode = config.sandboxMode || 'standard';

            // Set fullscreen permission
            this.allowFullscreen = config.allowFullscreen ?? true;

            this.setLoading(false);
        } catch (error) {
            this.setError(error instanceof Error ? error.message : 'Failed to load URL');
        }
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadWebURLPart() {
    // Prevents tree-shaking of the component
}
