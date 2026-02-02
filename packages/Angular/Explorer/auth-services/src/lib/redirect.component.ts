import { Component, OnInit } from '@angular/core';
import { MJAuthBase } from './mjexplorer-auth-base.service';

/**
 * Generic redirect component that handles OAuth callbacks for all providers
 * This replaces the MSAL-specific redirect component to work with any auth provider
 */
@Component({
  selector: 'app-redirect',
  template: `
    <div *ngIf="isProcessing" style="display: flex; justify-content: center; align-items: center; height: 100vh;">
      <div style="text-align: center;">
        <h2>Processing authentication...</h2>
        <p>Please wait while we complete your login.</p>
      </div>
    </div>
  `
})
export class RedirectComponent implements OnInit {
  isProcessing = false;

  constructor(private authService: MJAuthBase) {}

  async ngOnInit() {
    // DIAGNOSTIC: Persistent logging to trace redirect handling
    const debugLog = JSON.parse(localStorage.getItem('oauth_debug_log') || '[]');
    debugLog.push({
      time: new Date().toISOString(),
      event: 'REDIRECT_COMPONENT_NGONINIT',
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash
    });
    localStorage.setItem('oauth_debug_log', JSON.stringify(debugLog));

    // Only show the processing message if we're actually handling an auth redirect
    // Check for auth codes in the URL that indicate we're in a redirect flow
    const hasAuthCode = window.location.hash.includes('code=') ||
                       window.location.hash.includes('id_token=') ||
                       window.location.search.includes('code=') ||
                       window.location.search.includes('state=');

    // Don't handle MCP OAuth callbacks - those go to /oauth/callback and are handled
    // by the OAuthCallbackComponent in explorer-core. This component only handles
    // the main application auth (MSAL/Azure AD).
    const isMCPOAuthCallback = window.location.pathname.startsWith('/oauth/callback');

    // DIAGNOSTIC: Log the decision
    debugLog.push({
      time: new Date().toISOString(),
      event: 'REDIRECT_COMPONENT_DECISION',
      hasAuthCode,
      isMCPOAuthCallback,
      willProcess: hasAuthCode && !isMCPOAuthCallback
    });
    localStorage.setItem('oauth_debug_log', JSON.stringify(debugLog));

    if (hasAuthCode && !isMCPOAuthCallback) {
      this.isProcessing = true;
      try {
        // Handle the callback for the current auth provider
        await this.authService.handleCallback();
      } catch (error) {
        console.error('Error handling auth callback:', error);
      } finally {
        // Always hide the component after processing
        this.isProcessing = false;
      }
    }
  }
}