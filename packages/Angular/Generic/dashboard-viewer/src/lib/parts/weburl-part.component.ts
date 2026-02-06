import { Component, ChangeDetectorRef, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboardPart } from './base-dashboard-part';
import { PanelConfig } from '../models/dashboard-types';

/**
 * Runtime renderer for WebURL dashboard parts.
 * Displays web content in an iframe with configurable sandbox permissions.
 */
@RegisterClass(BaseDashboardPart, 'WebURLPanelRenderer')
@Component({
  standalone: false,
    selector: 'mj-weburl-part',
    template: `
        <div class="weburl-part" [class.loading]="IsLoading" [class.error]="ErrorMessage">
          <!-- Loading state -->
          @if (IsLoading) {
            <div class="loading-state">
              <i class="fa-solid fa-spinner fa-spin"></i>
              <span>Loading...</span>
            </div>
          }
        
          <!-- Error state -->
          @if (ErrorMessage) {
            <div class="error-state">
              <i class="fa-solid fa-exclamation-triangle"></i>
              <span>{{ ErrorMessage }}</span>
              @if (rawUrl) {
                <a [href]="rawUrl" target="_blank" class="open-link">
                  <i class="fa-solid fa-external-link-alt"></i>
                  Open in new window
                </a>
              }
            </div>
          }
        
          <!-- No URL configured -->
          @if (!IsLoading && !ErrorMessage && !SafeUrl) {
            <div class="empty-state">
              <i class="fa-solid fa-globe"></i>
              <h4>No URL Configured</h4>
              <p>Click the configure button to set a URL for this part.</p>
            </div>
          }
        
          <!-- Iframe container - sandbox and allowfullscreen must be static, so we use ng-container to switch -->
          @if (!IsLoading && !ErrorMessage && SafeUrl) {
            <!-- Standard sandbox + fullscreen enabled -->
            @if (sandboxMode === 'standard' && allowFullscreen) {
              <iframe
                #iframe
                [src]="SafeUrl"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                allowfullscreen
                [title]="Panel?.title || 'Embedded content'"
                (load)="onIframeLoad()"
                (error)="onIframeError($event)"
                class="content-iframe">
              </iframe>
            }
            <!-- Standard sandbox + fullscreen disabled -->
            @if (sandboxMode === 'standard' && !allowFullscreen) {
              <iframe
                #iframe
                [src]="SafeUrl"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                [title]="Panel?.title || 'Embedded content'"
                (load)="onIframeLoad()"
                (error)="onIframeError($event)"
                class="content-iframe">
              </iframe>
            }
            <!-- Strict sandbox + fullscreen enabled -->
            @if (sandboxMode === 'strict' && allowFullscreen) {
              <iframe
                #iframe
                [src]="SafeUrl"
                sandbox="allow-scripts"
                allowfullscreen
                [title]="Panel?.title || 'Embedded content'"
                (load)="onIframeLoad()"
                (error)="onIframeError($event)"
                class="content-iframe">
              </iframe>
            }
            <!-- Strict sandbox + fullscreen disabled -->
            @if (sandboxMode === 'strict' && !allowFullscreen) {
              <iframe
                #iframe
                [src]="SafeUrl"
                sandbox="allow-scripts"
                [title]="Panel?.title || 'Embedded content'"
                (load)="onIframeLoad()"
                (error)="onIframeError($event)"
                class="content-iframe">
              </iframe>
            }
            <!-- Permissive sandbox + fullscreen enabled -->
            @if (sandboxMode === 'permissive' && allowFullscreen) {
              <iframe
                #iframe
                [src]="SafeUrl"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation"
                allowfullscreen
                [title]="Panel?.title || 'Embedded content'"
                (load)="onIframeLoad()"
                (error)="onIframeError($event)"
                class="content-iframe">
              </iframe>
            }
            <!-- Permissive sandbox + fullscreen disabled -->
            @if (sandboxMode === 'permissive' && !allowFullscreen) {
              <iframe
                #iframe
                [src]="SafeUrl"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation"
                [title]="Panel?.title || 'Embedded content'"
                (load)="onIframeLoad()"
                (error)="onIframeError($event)"
                class="content-iframe">
              </iframe>
            }
          }
        
          <!-- Fallback link shown below iframe if content might be blocked -->
          @if (!IsLoading && !ErrorMessage && SafeUrl && showFallbackLink) {
            <div class="iframe-fallback">
              <span>If the content doesn't load:</span>
              <a [href]="rawUrl" target="_blank">
                <i class="fa-solid fa-external-link-alt"></i>
                Open in new window
              </a>
            </div>
          }
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
    `]
})
export class WebURLPartComponent extends BaseDashboardPart implements AfterViewInit {
    @ViewChild('iframe') iframeRef!: ElementRef<HTMLIFrameElement>;

    public SafeUrl: SafeResourceUrl | null = null;
    public rawUrl: string = '';
    public sandboxMode: 'standard' | 'strict' | 'permissive' = 'standard';
    public allowFullscreen: boolean = true;
    public showFallbackLink: boolean = false; // Hidden by default, shown if content might be blocked

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
        const config = this.getConfig<PanelConfig>();
        const url = config?.['url'] as string | undefined;

        // Clear any existing timeout
        if (this.loadCheckTimeout) {
            clearTimeout(this.loadCheckTimeout);
            this.loadCheckTimeout = null;
        }

        // Reset state
        this.iframeLoaded = false;
        this.showFallbackLink = false;

        if (!url) {
            this.SafeUrl = null;
            this.rawUrl = '';
            this.cdr.detectChanges();
            return;
        }

        this.setLoading(true);

        try {
            // Store raw URL for fallback link
            this.rawUrl = url;

            // Sanitize and set URL for iframe src binding
            this.SafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);

            // Set sandbox mode (used by template to select correct iframe)
            this.sandboxMode = (config?.['sandboxMode'] as 'standard' | 'strict' | 'permissive') || 'standard';

            // Set fullscreen permission
            this.allowFullscreen = (config?.['allowFullscreen'] as boolean) ?? true;

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
     * Called after a timeout - if the iframe load event hasn't fired, show the fallback link.
     */
    private checkIfBlocked(): void {
        // If the load event hasn't fired after the timeout, content might be blocked
        if (!this.iframeLoaded) {
            this.showFallbackLink = true;
            this.cdr.detectChanges();
        }
        // If iframeLoaded is true, content loaded successfully - keep fallback hidden
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
