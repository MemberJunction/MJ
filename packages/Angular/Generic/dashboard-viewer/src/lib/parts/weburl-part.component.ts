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
                <a *ngIf="rawUrl" [href]="rawUrl" target="_blank" class="open-link">
                    <i class="fa-solid fa-external-link-alt"></i>
                    Open in new window
                </a>
            </div>

            <!-- No URL configured -->
            <div class="empty-state" *ngIf="!IsLoading && !ErrorMessage && !SafeUrl">
                <i class="fa-solid fa-globe"></i>
                <h4>No URL Configured</h4>
                <p>Click the configure button to set a URL for this part.</p>
            </div>

            <!-- Iframe container - sandbox and allowfullscreen must be static, so we use ng-container to switch -->
            <ng-container *ngIf="!IsLoading && !ErrorMessage && SafeUrl">
                <!-- Standard sandbox + fullscreen enabled -->
                <iframe
                    *ngIf="sandboxMode === 'standard' && allowFullscreen"
                    #iframe
                    [src]="SafeUrl"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    allowfullscreen
                    [title]="Panel?.title || 'Embedded content'"
                    (load)="onIframeLoad()"
                    (error)="onIframeError($event)"
                    class="content-iframe">
                </iframe>
                <!-- Standard sandbox + fullscreen disabled -->
                <iframe
                    *ngIf="sandboxMode === 'standard' && !allowFullscreen"
                    #iframe
                    [src]="SafeUrl"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    [title]="Panel?.title || 'Embedded content'"
                    (load)="onIframeLoad()"
                    (error)="onIframeError($event)"
                    class="content-iframe">
                </iframe>
                <!-- Strict sandbox + fullscreen enabled -->
                <iframe
                    *ngIf="sandboxMode === 'strict' && allowFullscreen"
                    #iframe
                    [src]="SafeUrl"
                    sandbox="allow-scripts"
                    allowfullscreen
                    [title]="Panel?.title || 'Embedded content'"
                    (load)="onIframeLoad()"
                    (error)="onIframeError($event)"
                    class="content-iframe">
                </iframe>
                <!-- Strict sandbox + fullscreen disabled -->
                <iframe
                    *ngIf="sandboxMode === 'strict' && !allowFullscreen"
                    #iframe
                    [src]="SafeUrl"
                    sandbox="allow-scripts"
                    [title]="Panel?.title || 'Embedded content'"
                    (load)="onIframeLoad()"
                    (error)="onIframeError($event)"
                    class="content-iframe">
                </iframe>
                <!-- Permissive sandbox + fullscreen enabled -->
                <iframe
                    *ngIf="sandboxMode === 'permissive' && allowFullscreen"
                    #iframe
                    [src]="SafeUrl"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation"
                    allowfullscreen
                    [title]="Panel?.title || 'Embedded content'"
                    (load)="onIframeLoad()"
                    (error)="onIframeError($event)"
                    class="content-iframe">
                </iframe>
                <!-- Permissive sandbox + fullscreen disabled -->
                <iframe
                    *ngIf="sandboxMode === 'permissive' && !allowFullscreen"
                    #iframe
                    [src]="SafeUrl"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation"
                    [title]="Panel?.title || 'Embedded content'"
                    (load)="onIframeLoad()"
                    (error)="onIframeError($event)"
                    class="content-iframe">
                </iframe>
            </ng-container>

            <!-- Overlay message shown when embedding may be blocked -->
            <div class="embed-blocked-overlay" *ngIf="!IsLoading && !ErrorMessage && SafeUrl && showBlockedOverlay">
                <div class="blocked-message">
                    <i class="fa-solid fa-shield-halved"></i>
                    <h4>This site may not allow embedding</h4>
                    <p>Some websites block being displayed in frames for security reasons.</p>
                    <a [href]="rawUrl" target="_blank" class="open-link">
                        <i class="fa-solid fa-external-link-alt"></i>
                        Open in new window
                    </a>
                </div>
            </div>

            <!-- Fallback link shown below iframe in case embedding fails silently -->
            <div class="iframe-fallback" *ngIf="!IsLoading && !ErrorMessage && SafeUrl && showFallbackLink && !showBlockedOverlay">
                <span>If the content doesn't load:</span>
                <a [href]="rawUrl" target="_blank">
                    <i class="fa-solid fa-external-link-alt"></i>
                    Open in new window
                </a>
            </div>
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
            position: relative; /* Required for overlay positioning */
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

        .error-state .open-link {
            margin-top: 16px;
            padding: 8px 16px;
            background: #5c6bc0;
            color: #fff;
            text-decoration: none;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
        }

        .error-state .open-link:hover {
            background: #3f51b5;
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

        .iframe-fallback {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 8px;
            background: #f5f5f5;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #666;
        }

        .iframe-fallback a {
            color: #5c6bc0;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .iframe-fallback a:hover {
            text-decoration: underline;
        }

        .embed-blocked-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.95);
            z-index: 10;
        }

        .blocked-message {
            text-align: center;
            padding: 32px;
            max-width: 400px;
        }

        .blocked-message i {
            font-size: 48px;
            color: #ff9800;
            margin-bottom: 16px;
        }

        .blocked-message h4 {
            margin: 0 0 8px 0;
            font-size: 18px;
            color: #333;
        }

        .blocked-message p {
            margin: 0 0 20px 0;
            font-size: 14px;
            color: #666;
            line-height: 1.5;
        }

        .blocked-message .open-link {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            background: #5c6bc0;
            color: #fff;
            text-decoration: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
        }

        .blocked-message .open-link:hover {
            background: #3f51b5;
        }
    `]
})
export class WebURLPartComponent extends BaseDashboardPart implements AfterViewInit {
    @ViewChild('iframe') iframeRef!: ElementRef<HTMLIFrameElement>;

    public SafeUrl: SafeResourceUrl | null = null;
    public rawUrl: string = '';
    public sandboxMode: 'standard' | 'strict' | 'permissive' = 'standard';
    public allowFullscreen: boolean = true;
    public showFallbackLink: boolean = true; // Show fallback by default for sites that block embedding
    public showBlockedOverlay: boolean = false; // Show overlay when embedding is blocked

    private sanitizer: DomSanitizer;
    private loadCheckTimeout: ReturnType<typeof setTimeout> | null = null;
    private iframeLoaded: boolean = false;

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

        // Clear any existing timeout
        if (this.loadCheckTimeout) {
            clearTimeout(this.loadCheckTimeout);
            this.loadCheckTimeout = null;
        }

        // Reset state
        this.iframeLoaded = false;
        this.showBlockedOverlay = false;

        if (!config?.url) {
            this.SafeUrl = null;
            this.rawUrl = '';
            this.cdr.detectChanges();
            return;
        }

        this.setLoading(true);

        try {
            // Store raw URL for fallback link
            this.rawUrl = config.url;

            // Sanitize and set URL for iframe src binding
            this.SafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(config.url);

            // Set sandbox mode (used by template to select correct iframe)
            this.sandboxMode = config.sandboxMode || 'standard';

            // Set fullscreen permission
            this.allowFullscreen = config.allowFullscreen ?? true;

            this.setLoading(false);

            // Set up a delayed check to detect if embedding might be blocked
            // If after 3 seconds the iframe hasn't successfully loaded content we can access,
            // show the blocked overlay. This is a heuristic since we can't detect X-Frame-Options directly.
            this.loadCheckTimeout = setTimeout(() => {
                this.checkIfBlocked();
            }, 3000);

        } catch (error) {
            this.setError(error instanceof Error ? error.message : 'Failed to load URL');
        }
    }

    /**
     * Check if the iframe content might be blocked.
     * Due to cross-origin restrictions, we can't access iframe.contentWindow for external sites,
     * but we can use heuristics like checking if the iframe loaded but we detect it might be blocked.
     */
    private checkIfBlocked(): void {
        // If the iframe's load event fired but we're still showing (no error),
        // check if we can detect blocking
        if (this.iframeLoaded && this.iframeRef?.nativeElement) {
            try {
                // Try to access the iframe's contentDocument
                // This will throw a security error for cross-origin iframes
                // For blocked iframes, the contentDocument might be null or empty
                const iframe = this.iframeRef.nativeElement;
                const contentWindow = iframe.contentWindow;

                // If contentWindow exists but contentDocument is null due to cross-origin,
                // we can't tell if it's blocked. We rely on the load event.
                // However, if the iframe is actually showing blank content, the user sees nothing.

                // Heuristic: check if the iframe appears to have no rendered content
                // by checking its dimensions or if contentWindow.length is 0 (no frames inside)
                if (contentWindow) {
                    // Check if there are any frames (most real pages have at least the main frame)
                    // Note: This is a weak heuristic and may not work for all cases
                    // For truly blocked content, we'll show the overlay
                }
            } catch {
                // Cross-origin access error - this is expected for external sites
                // We can't determine if it's blocked, so we'll show the fallback link but not overlay
            }
        }

        // For now, we don't automatically show the overlay since we can't reliably detect blocking
        // The fallback link provides a way for users to open the site if it doesn't load
        this.cdr.detectChanges();
    }

    /**
     * Handle iframe load event
     */
    public onIframeLoad(): void {
        // Mark that the load event fired
        this.iframeLoaded = true;

        // Clear the timeout since the iframe loaded
        if (this.loadCheckTimeout) {
            clearTimeout(this.loadCheckTimeout);
            this.loadCheckTimeout = null;
        }

        // The iframe loaded something - could still be blocked content
        // We can't reliably detect X-Frame-Options blocking from JS
        // The fallback link provides a way for users to open the site if it doesn't load
        this.cdr.detectChanges();
    }

    /**
     * Handle iframe error event
     */
    public onIframeError(_event: Event): void {
        // This may fire for some load failures, but not for X-Frame-Options
        this.setError('This site cannot be embedded. It may block iframe embedding for security reasons.');
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadWebURLPart() {
    // Prevents tree-shaking of the component
}
