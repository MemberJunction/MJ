/**
 * @fileoverview OAuth Callback Component
 *
 * Handles OAuth provider redirects in the frontend. When an OAuth provider
 * redirects back to the application after user authorization, this component:
 * 1. Waits for the user's session to be restored (authentication)
 * 2. Extracts the code and state from URL query parameters
 * 3. Calls the backend /oauth/exchange endpoint to complete the token exchange
 * 4. Redirects to the original page with success/error notification
 *
 * @module OAuth Callback
 */

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Metadata } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/**
 * Response from the OAuth exchange endpoint
 */
interface OAuthExchangeResponse {
    success: boolean;
    connectionId?: string;
    errorCode?: string;
    errorMessage?: string;
    isRetryable?: boolean;
}

/** Maximum time to wait for provider initialization (30 seconds) */
const MAX_WAIT_TIME_MS = 30000;
/** Polling interval for checking provider readiness (500ms) */
const POLL_INTERVAL_MS = 500;

/**
 * OAuth Callback Component
 *
 * Handles the redirect from OAuth providers after user authorization.
 * This component is loaded at /oauth/callback and processes the
 * authorization code to complete the OAuth flow.
 *
 * The component waits for authentication to complete before attempting
 * the code exchange, since the user's session needs to be restored first.
 */
@Component({
    selector: 'mj-oauth-callback',
    templateUrl: './oauth-callback.component.html',
    styleUrls: ['./oauth-callback.component.css']
})
export class OAuthCallbackComponent implements OnInit, OnDestroy {
    /** Loading state while processing OAuth callback */
    public IsLoading = true;

    /** Error state */
    public HasError = false;

    /** Error message to display */
    public ErrorMessage = '';

    /** Error code from OAuth provider or exchange */
    public ErrorCode = '';

    /** Whether the error is retryable */
    public IsRetryable = false;

    /** Status message shown during processing */
    public StatusMessage = 'Restoring session...';

    /** Timer for polling provider readiness */
    private pollTimer: ReturnType<typeof setInterval> | null = null;

    /** Flag to prevent double processing */
    private isProcessing = false;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private cdr: ChangeDetectorRef
    ) {
        // DIAGNOSTIC: Persistent logging to survive page navigation
        const timestamp = new Date().toISOString();
        const debugLog = JSON.parse(localStorage.getItem('oauth_debug_log') || '[]');
        debugLog.push({ time: timestamp, event: 'CONSTRUCTOR', url: window.location.href });
        localStorage.setItem('oauth_debug_log', JSON.stringify(debugLog));

        console.log('[OAuth Callback] Component constructor called');
        console.log('[OAuth Callback] Current URL:', window.location.href);
    }

    async ngOnInit(): Promise<void> {
        // DIAGNOSTIC: Persistent logging
        this.persistLog('NGONINIT', { queryParams: this.route.snapshot.queryParams });

        console.log('[OAuth Callback] ngOnInit started');
        console.log('[OAuth Callback] Query params:', this.route.snapshot.queryParams);

        // Wait for the GraphQL provider to be ready, then process the callback
        await this.waitForProviderAndProcess();
    }

    /** DIAGNOSTIC: Persist log to localStorage to survive navigation */
    private persistLog(event: string, data?: Record<string, unknown>): void {
        try {
            const timestamp = new Date().toISOString();
            const debugLog = JSON.parse(localStorage.getItem('oauth_debug_log') || '[]');
            debugLog.push({ time: timestamp, event, ...data });
            localStorage.setItem('oauth_debug_log', JSON.stringify(debugLog));
        } catch (e) {
            console.error('[OAuth Callback] Failed to persist log:', e);
        }
    }

    ngOnDestroy(): void {
        // Clean up the polling timer
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /**
     * Waits for the GraphQL provider to be initialized (indicating auth is complete)
     * then processes the OAuth callback.
     */
    private async waitForProviderAndProcess(): Promise<void> {
        this.persistLog('WAIT_FOR_PROVIDER_START');
        const startTime = Date.now();

        // Check if provider is already ready
        if (this.isProviderReady()) {
            this.persistLog('PROVIDER_ALREADY_READY');
            console.log('[OAuth Callback] Provider already ready, processing immediately');
            await this.safeProcessCallback();
            return;
        }
        this.persistLog('PROVIDER_NOT_READY_STARTING_POLL');

        // Poll for provider readiness
        this.StatusMessage = 'Waiting for authentication...';
        this.cdr.detectChanges();

        return new Promise<void>((resolve) => {
            this.pollTimer = setInterval(async () => {
                const elapsed = Date.now() - startTime;

                if (this.isProviderReady()) {
                    console.log('[OAuth Callback] Provider became ready after', elapsed, 'ms');
                    if (this.pollTimer) {
                        clearInterval(this.pollTimer);
                        this.pollTimer = null;
                    }
                    await this.safeProcessCallback();
                    resolve();
                    return;
                }

                if (elapsed >= MAX_WAIT_TIME_MS) {
                    console.error('[OAuth Callback] Timed out waiting for provider after', elapsed, 'ms');
                    if (this.pollTimer) {
                        clearInterval(this.pollTimer);
                        this.pollTimer = null;
                    }
                    this.showError(
                        'timeout',
                        'Timed out waiting for authentication. Please try logging in again.',
                        true
                    );
                    resolve();
                    return;
                }

                // Update status message with progress
                const secondsRemaining = Math.ceil((MAX_WAIT_TIME_MS - elapsed) / 1000);
                this.StatusMessage = `Waiting for authentication... (${secondsRemaining}s)`;
                this.cdr.detectChanges();
            }, POLL_INTERVAL_MS);
        });
    }

    /**
     * Checks if the GraphQL provider is initialized and has a valid token
     */
    private isProviderReady(): boolean {
        try {
            const provider = Metadata.Provider as GraphQLDataProvider;
            if (!provider) {
                return false;
            }
            const configData = provider.ConfigData;
            if (!configData || !configData.Token || !configData.URL) {
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Safely processes the callback, preventing double execution
     */
    private async safeProcessCallback(): Promise<void> {
        if (this.isProcessing) {
            console.log('[OAuth Callback] Already processing, skipping');
            return;
        }
        this.isProcessing = true;

        try {
            await this.processOAuthCallback();
        } catch (error) {
            console.error('[OAuth Callback] Error in processOAuthCallback:', error);
            this.showError('component_error', error instanceof Error ? error.message : String(error), true);
        }
    }

    /**
     * Process the OAuth callback by extracting params and exchanging the code
     */
    private async processOAuthCallback(): Promise<void> {
        const params = this.route.snapshot.queryParams;

        // Check for error from OAuth provider
        if (params['error']) {
            this.showError(
                params['error'] as string,
                params['error_description'] as string || 'Authorization was denied or failed'
            );
            return;
        }

        const code = params['code'] as string;
        const state = params['state'] as string;

        // Validate required parameters
        if (!code) {
            this.showError('missing_code', 'No authorization code received from the OAuth provider');
            return;
        }

        if (!state) {
            this.showError('missing_state', 'No state parameter received from the OAuth provider');
            return;
        }

        // Exchange the code for tokens
        this.StatusMessage = 'Exchanging authorization code...';
        this.cdr.detectChanges();

        try {
            const result = await this.exchangeCode(code, state);

            if (result.success) {
                this.handleSuccess(result.connectionId);
            } else {
                this.showError(
                    result.errorCode || 'exchange_failed',
                    result.errorMessage || 'Failed to complete authorization',
                    result.isRetryable
                );
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'An unexpected error occurred';
            this.showError('network_error', message, true);
        }
    }

    /**
     * Call the backend to exchange the authorization code for tokens
     */
    private async exchangeCode(code: string, state: string): Promise<OAuthExchangeResponse> {
        console.log('[OAuth Callback] exchangeCode called with state:', state);

        // Get the GraphQL provider - we know it's ready at this point
        const gqlProvider = Metadata.Provider as GraphQLDataProvider;
        const configData = gqlProvider.ConfigData;

        // Build the exchange endpoint URL from the GraphQL URL
        // Handle both cases: URL with /graphql suffix and URL without
        let apiUrl = configData.URL;
        if (apiUrl.includes('/graphql')) {
            apiUrl = apiUrl.replace('/graphql', '/oauth/exchange');
        } else {
            // URL doesn't have /graphql, append /oauth/exchange
            apiUrl = apiUrl.replace(/\/$/, '') + '/oauth/exchange';
        }
        console.log('[OAuth Callback] Calling exchange endpoint:', apiUrl);

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${configData.Token}`
                },
                body: JSON.stringify({ code, state })
            });

            console.log('[OAuth Callback] Exchange response status:', response.status);

            // Parse response regardless of status code
            const data = await response.json();
            console.log('[OAuth Callback] Exchange response data:', data);
            return data as OAuthExchangeResponse;
        } catch (fetchError) {
            console.error('[OAuth Callback] Fetch error:', fetchError);
            return {
                success: false,
                errorCode: 'fetch_error',
                errorMessage: fetchError instanceof Error ? fetchError.message : 'Network error during token exchange'
            };
        }
    }

    /**
     * Handle successful OAuth completion
     */
    private handleSuccess(connectionId?: string): void {
        this.IsLoading = false;
        this.StatusMessage = 'Authorization successful! Redirecting...';
        this.cdr.detectChanges();

        // Get the stored return URL - try both localStorage and sessionStorage
        const storedUrl = localStorage.getItem('oauth_return_url');
        const storedPath = localStorage.getItem('oauth_return_path');
        const sessionUrl = sessionStorage.getItem('oauth_return_url');
        const sessionPath = sessionStorage.getItem('oauth_return_path');

        console.log('[OAuth Callback] Storage check - localStorage URL:', storedUrl);
        console.log('[OAuth Callback] Storage check - localStorage path:', storedPath);
        console.log('[OAuth Callback] Storage check - sessionStorage URL:', sessionUrl);
        console.log('[OAuth Callback] Storage check - sessionStorage path:', sessionPath);

        let returnUrl = storedUrl || sessionUrl || storedPath || sessionPath;

        // Clean up all possible storage locations
        this.clearStoredReturnUrls();

        // Default to MCP dashboard if no return URL found
        const defaultPath = '/app/admin/MCP';
        if (!returnUrl || returnUrl.trim() === '' || returnUrl === '/') {
            console.log('[OAuth Callback] No valid return URL found in storage, defaulting to:', defaultPath);
            returnUrl = defaultPath;
        } else {
            console.log('[OAuth Callback] Found return URL:', returnUrl);
        }

        // Build the final navigation path
        const finalPath = this.buildFinalPath(returnUrl, connectionId, defaultPath);
        console.log('[OAuth Callback] Final navigation path:', finalPath);

        // Use window.location for reliable navigation after OAuth
        setTimeout(() => {
            console.log('[OAuth Callback] Executing navigation now...');
            window.location.href = finalPath;
        }, 500);
    }

    /**
     * Builds the final navigation path with success query params
     */
    private buildFinalPath(returnUrl: string, connectionId: string | undefined, defaultPath: string): string {
        try {
            let finalPath: string;

            // If it's a full URL, extract just the path and search
            if (returnUrl.startsWith('http://') || returnUrl.startsWith('https://')) {
                const url = new URL(returnUrl);
                finalPath = url.pathname + url.search;
            } else {
                finalPath = returnUrl;
            }

            // Ensure we have a valid path (not empty or just "/")
            if (!finalPath || finalPath.trim() === '' || finalPath === '/') {
                finalPath = defaultPath;
            }

            // Add success query params
            const separator = finalPath.includes('?') ? '&' : '?';
            finalPath = `${finalPath}${separator}oauth=success`;
            if (connectionId) {
                finalPath += `&connectionId=${connectionId}`;
            }

            return finalPath;
        } catch (e) {
            console.error('[OAuth Callback] Error parsing return URL:', e);
            return `${defaultPath}?oauth=success${connectionId ? `&connectionId=${connectionId}` : ''}`;
        }
    }

    /**
     * Clears all stored return URLs from storage
     */
    private clearStoredReturnUrls(): void {
        localStorage.removeItem('oauth_return_url');
        localStorage.removeItem('oauth_return_path');
        sessionStorage.removeItem('oauth_return_url');
        sessionStorage.removeItem('oauth_return_path');
    }

    /**
     * Show error state
     */
    private showError(errorCode: string, message: string, isRetryable = false): void {
        this.IsLoading = false;
        this.HasError = true;
        this.ErrorCode = errorCode;
        this.ErrorMessage = message;
        this.IsRetryable = isRetryable;
        this.cdr.detectChanges();
    }

    /**
     * Handle retry button click
     */
    public onRetry(): void {
        // Get the stored return URL and redirect there to start fresh
        const returnUrl = localStorage.getItem('oauth_return_url') || '/app/admin/MCP';
        this.clearStoredReturnUrls();
        this.router.navigateByUrl(returnUrl);
    }

    /**
     * Handle close button click (return to MCP dashboard)
     */
    public onClose(): void {
        this.clearStoredReturnUrls();
        this.router.navigate(['/app/admin/MCP']);
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadOAuthCallbackComponent(): void {
    // Prevents tree-shaking
}
