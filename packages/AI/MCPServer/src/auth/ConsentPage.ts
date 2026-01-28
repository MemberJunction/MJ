/**
 * @fileoverview Consent Page for OAuth Authorization
 *
 * Renders an HTML consent screen where users can select which scopes
 * to grant to the requesting MCP client application.
 *
 * @module @memberjunction/ai-mcp-server/auth/ConsentPage
 */

import type { APIScopeInfo, ConsentRequest } from './types.js';
import { groupScopesByCategory } from './ScopeService.js';
import { getOAuthStyles } from './styles.js';

/**
 * Renders the consent page HTML.
 *
 * @param consentRequest - The consent request containing user and scope info
 * @returns HTML string for the consent page
 */
export function renderConsentPage(consentRequest: ConsentRequest): string {
  const { user, availableScopes, clientId, requestId } = consentRequest;
  const groupedScopes = groupScopesByCategory(availableScopes);

  const scopeCheckboxes = renderScopeCheckboxes(groupedScopes);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize Access - MemberJunction MCP Server</title>
  <style>${getOAuthStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">MJ</div>
        <h1>Authorize Access</h1>
      </div>

      <div class="user-info">
        <p>Signed in as <strong>${escapeHtml(user.email)}</strong></p>
      </div>

      <div class="client-info">
        <p>The application <strong>${escapeHtml(clientId)}</strong> is requesting access to your MemberJunction account.</p>
      </div>

      <form method="POST" action="/oauth/consent" class="consent-form">
        <input type="hidden" name="requestId" value="${escapeHtml(requestId)}">

        <div class="scope-section">
          <h2>Select Permissions</h2>
          <p class="scope-description">Choose which permissions to grant this application:</p>

          ${scopeCheckboxes}
        </div>

        <div class="button-group">
          <button type="submit" name="action" value="approve" class="btn btn-primary">
            Authorize
          </button>
          <button type="submit" name="action" value="deny" class="btn btn-secondary">
            Deny
          </button>
        </div>
      </form>

      <div class="footer">
        <p class="security-note">
          You can revoke access at any time from your account settings.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Renders scope checkboxes grouped by category.
 */
function renderScopeCheckboxes(groupedScopes: Map<string, APIScopeInfo[]>): string {
  const categories: string[] = [];

  for (const [category, scopes] of groupedScopes) {
    const scopeItems = scopes
      .map(
        (scope) => `
        <label class="scope-item">
          <input type="checkbox" name="scopes" value="${escapeHtml(scope.Name)}" checked>
          <span class="scope-name">${escapeHtml(scope.Name)}</span>
          <span class="scope-desc">${escapeHtml(scope.Description)}</span>
        </label>`
      )
      .join('');

    categories.push(`
      <div class="scope-category">
        <h3>${escapeHtml(category)}</h3>
        <div class="scope-list">
          ${scopeItems}
        </div>
      </div>
    `);
  }

  return categories.join('');
}

/**
 * Renders a success page after consent is granted.
 *
 * @param message - Success message to display
 * @returns HTML string for success page
 */
export function renderConsentSuccessPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Complete - MemberJunction MCP Server</title>
  <style>${getOAuthStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">MJ</div>
        <h1>Authorization Complete</h1>
      </div>
      <div class="success-message">
        <p>${escapeHtml(message)}</p>
        <p>You can now close this window and return to the application.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Renders a page when user denies consent.
 *
 * @returns HTML string for denied page
 */
export function renderConsentDeniedPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Denied - MemberJunction MCP Server</title>
  <style>${getOAuthStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">MJ</div>
        <h1>Access Denied</h1>
      </div>
      <div class="error-message">
        <p>You have denied the authorization request.</p>
        <p>The application will not have access to your MemberJunction account.</p>
        <p>You can close this window.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Escapes HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
