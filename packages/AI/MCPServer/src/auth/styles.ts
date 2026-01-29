/**
 * @fileoverview CSS Styles for OAuth UI Pages
 *
 * Provides consistent MemberJunction branding for OAuth flow pages:
 * - Login page
 * - Consent page
 * - Error pages
 *
 * @module @memberjunction/ai-mcp-server/auth/styles
 */

/**
 * Returns the CSS styles for OAuth UI pages.
 * Uses MemberJunction brand colors and modern design patterns.
 */
export function getOAuthStyles(): string {
  return `
    :root {
      /* MemberJunction brand colors - matching MJExplorer */
      --mj-primary: #0076B6;
      --mj-primary-hover: #005a9e;
      --mj-navy: #092340;
      --mj-light-blue: #AAE7FD;
      --mj-secondary: #AAA;
      --mj-secondary-hover: #888;
      --mj-success: #28a745;
      --mj-error: #dc3545;
      --mj-warning: #ffc107;
      --mj-background: #F4F4F4;
      --mj-card-bg: #ffffff;
      --mj-text: #092340;
      --mj-text-muted: #AAA;
      --mj-border: #D9D9D9;
      --mj-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      --mj-border-radius: 1rem;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--mj-background);
      color: var(--mj-text);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 1rem;
      line-height: 1.5;
    }

    .container {
      width: 100%;
      max-width: 480px;
    }

    .card {
      background: var(--mj-card-bg);
      border-radius: var(--mj-border-radius);
      box-shadow: var(--mj-shadow);
      padding: 2rem;
      border: 2px solid transparent;
    }

    .header {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .logo-svg {
      display: block;
      width: 56px;
      max-width: 56px;
      height: auto;
      max-height: 32px;
      margin: 0 auto 1rem auto;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 400;
      color: var(--mj-navy);
    }

    h2 {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--mj-text);
      margin-bottom: 0.5rem;
    }

    h3 {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--mj-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.75rem;
    }

    p {
      color: var(--mj-text-muted);
      margin-bottom: 0.5rem;
    }

    .user-info {
      background: var(--mj-background);
      border-radius: var(--mj-border-radius);
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      text-align: center;
    }

    .user-info p {
      margin: 0;
      font-size: 0.875rem;
    }

    .client-info {
      margin-bottom: 1.5rem;
      text-align: center;
    }

    .client-info p {
      font-size: 0.9375rem;
    }

    .scope-section {
      margin-bottom: 1.5rem;
    }

    .scope-description {
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    /* Full Access Section - Special treatment for full_access scope */
    .full-access-section {
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid var(--mj-border);
    }

    .full-access-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1rem;
      background: linear-gradient(135deg, #fef3c7, #fffbeb);
      border: 2px solid #f59e0b;
      border-radius: var(--mj-border-radius);
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .full-access-item:hover {
      background: linear-gradient(135deg, #fde68a, #fef3c7);
      border-color: #d97706;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
    }

    .full-access-item input[type="checkbox"] {
      flex-shrink: 0;
      width: 1.25rem;
      height: 1.25rem;
      margin-top: 0.25rem;
      accent-color: #f59e0b;
    }

    .full-access-content {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      flex: 1;
    }

    .full-access-icon {
      font-size: 1.5rem;
      color: #f59e0b;
      flex-shrink: 0;
    }

    .full-access-text {
      flex: 1;
    }

    .full-access-label {
      display: block;
      font-weight: 700;
      font-size: 1rem;
      color: #92400e;
    }

    .full-access-desc {
      display: block;
      font-size: 0.8125rem;
      color: #a16207;
      margin-top: 0.25rem;
      line-height: 1.4;
    }

    .clear-all-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      margin-top: 0.75rem;
      padding: 0.5rem 1rem;
      font-size: 0.8125rem;
      font-weight: 500;
      background: transparent;
      color: var(--mj-text-muted);
      border: 1px solid var(--mj-border);
      border-radius: var(--mj-border-radius);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .clear-all-btn:hover {
      background: #fef2f2;
      border-color: #fecaca;
      color: #dc2626;
    }

    /* Legacy grant-all styles - kept for backwards compatibility */
    .grant-all-section {
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--mj-border);
    }

    .grant-all-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1rem;
      background: linear-gradient(135deg, #e6f4fb, #f0faff);
      border: 2px solid var(--mj-light-blue);
      border-radius: var(--mj-border-radius);
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .grant-all-item:hover {
      background: linear-gradient(135deg, #cce9f7, #e0f4ff);
      border-color: var(--mj-primary);
    }

    .grant-all-item input[type="checkbox"] {
      flex-shrink: 0;
      width: 1.25rem;
      height: 1.25rem;
      margin-top: 0.125rem;
      accent-color: var(--mj-primary);
    }

    .grant-all-label {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--mj-text);
    }

    .grant-all-desc {
      display: block;
      font-size: 0.8125rem;
      color: var(--mj-text-muted);
      margin-top: 0.125rem;
    }

    .scope-category {
      margin-bottom: 1.25rem;
    }

    .category-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      padding: 0.75rem;
      user-select: none;
      background: var(--mj-background);
      border-radius: var(--mj-border-radius);
      transition: background 0.2s ease;
    }

    .category-header:hover {
      background: #e8e8e8;
    }

    .category-header i {
      font-size: 1rem;
      width: 1.25rem;
      text-align: center;
    }

    .category-toggle {
      font-size: 0.625rem;
      color: var(--mj-text-muted);
      transition: transform 0.2s ease;
      width: 0.75rem;
    }

    .category-name {
      font-weight: 600;
      color: var(--mj-text);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 0.8125rem;
    }

    .category-count {
      font-size: 0.75rem;
      font-weight: 400;
      color: var(--mj-text-muted);
    }

    .category-select-btn {
      padding: 0.25rem 0.5rem;
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: transparent;
      color: var(--mj-primary);
      border: 1px solid var(--mj-primary);
      border-radius: 0.25rem;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-left: 0.25rem;
    }

    .category-select-btn:first-of-type {
      margin-left: auto;
    }

    .category-select-btn:hover {
      background: var(--mj-primary);
      color: white;
    }

    .scope-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 0.75rem;
      padding-top: 0.5rem;
    }

    /* Prefix group container */
    .prefix-group {
      border-left: 3px solid var(--mj-border);
      padding-left: 0.75rem;
    }

    .prefix-group.orphaned {
      border-left-color: var(--mj-text-muted);
    }

    /* Scope children container */
    .scope-children {
      margin-left: 1.5rem;
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      border-left: 2px solid var(--mj-border);
      padding-left: 0.75rem;
    }

    .scope-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem;
      background: var(--mj-background);
      border-radius: var(--mj-border-radius);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .scope-item:hover {
      background: var(--mj-light-blue);
    }

    /* Parent scope styling */
    .scope-item.scope-parent {
      background: white;
      border: 1px solid var(--mj-border);
    }

    .scope-item.scope-parent:hover {
      border-color: var(--mj-primary);
      background: #f8fafc;
    }

    .scope-item.scope-parent .scope-content {
      flex: 1;
    }

    /* Child scope styling */
    .scope-item.scope-child {
      padding: 0.5rem 0.75rem;
      background: #fafafa;
    }

    .scope-item.scope-child:hover {
      background: var(--mj-light-blue);
    }

    /* Disabled state for implied scopes */
    .scope-item input[type="checkbox"]:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .scope-item:has(input:disabled) {
      opacity: 0.7;
      cursor: not-allowed;
      background: #f0f0f0;
    }

    .scope-item:has(input:disabled):hover {
      background: #f0f0f0;
    }

    .scope-item input[type="checkbox"] {
      flex-shrink: 0;
      width: 1.125rem;
      height: 1.125rem;
      margin-top: 0.125rem;
      accent-color: var(--mj-primary);
    }

    .scope-name {
      font-weight: 500;
      font-size: 0.875rem;
      color: var(--mj-text);
      font-family: 'SF Mono', Monaco, 'Consolas', monospace;
    }

    .scope-desc {
      display: block;
      font-size: 0.8125rem;
      color: var(--mj-text-muted);
      margin-top: 0.125rem;
    }

    .scope-children-note {
      display: block;
      font-size: 0.75rem;
      color: var(--mj-primary);
      margin-top: 0.25rem;
      font-style: italic;
    }

    /* Parent scope header with collapsible children */
    .parent-scope-header {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem;
      background: white;
      border: 1px solid var(--mj-border);
      border-radius: var(--mj-border-radius);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .parent-scope-header:hover {
      border-color: var(--mj-primary);
      background: #f8fafc;
    }

    .parent-scope-header input[type="checkbox"] {
      flex-shrink: 0;
      width: 1.125rem;
      height: 1.125rem;
      margin-top: 0.125rem;
      accent-color: var(--mj-primary);
    }

    .parent-scope-header .scope-content {
      flex: 1;
      min-width: 0;
    }

    .children-toggle {
      flex-shrink: 0;
      width: 1.5rem;
      height: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.625rem;
      color: var(--mj-text-muted);
      background: var(--mj-background);
      border-radius: 0.25rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .children-toggle:hover {
      background: var(--mj-light-blue);
      color: var(--mj-primary);
    }

    /* Single parent in category - more compact styling */
    .prefix-group.single-in-category {
      border-left: none;
      padding-left: 0;
    }

    .prefix-group.single-in-category .parent-scope-header {
      border: none;
      background: transparent;
      padding: 0.5rem 0;
    }

    .prefix-group.single-in-category .parent-scope-header:hover {
      background: transparent;
    }

    /* Integrated parent checkbox in category header */
    .category-header.integrated-parent {
      flex-wrap: wrap;
      gap: 0.5rem 0.75rem;
    }

    .category-header.integrated-parent .category-toggle {
      cursor: pointer;
    }

    .integrated-parent-checkbox {
      display: flex;
      align-items: center;
      margin-left: auto;
      cursor: pointer;
    }

    .integrated-parent-checkbox input[type="checkbox"] {
      width: 1.125rem;
      height: 1.125rem;
      accent-color: var(--mj-primary);
    }

    .integrated-parent-desc {
      flex-basis: 100%;
      font-size: 0.8125rem;
      color: var(--mj-text-muted);
      margin-left: 1.25rem;
      margin-top: -0.25rem;
    }

    /* Single-parent category scope list - show children directly */
    .scope-category.single-parent .scope-list {
      padding-left: 1.25rem;
    }

    .scope-category.single-parent .scope-list .scope-children {
      margin-left: 0;
      border-left: 2px solid var(--mj-border);
      padding-left: 0.75rem;
    }

    .button-group {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .btn {
      flex: 1;
      padding: 0.75rem 1.5rem;
      font-size: 0.9375rem;
      font-weight: 500;
      border: none;
      border-radius: var(--mj-border-radius);
      cursor: pointer;
      transition: all 0.3s ease;
      min-height: 44px;
    }

    .btn-primary {
      background: var(--mj-primary);
      color: white;
      border: 1px solid var(--mj-primary);
    }

    .btn-primary:hover {
      background: var(--mj-primary-hover);
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 118, 182, 0.3);
    }

    .btn-secondary {
      background: transparent;
      color: var(--mj-primary);
      border: 1px solid var(--mj-primary);
    }

    .btn-secondary:hover {
      background: var(--mj-primary);
      color: white;
      transform: translateY(-1px);
    }

    .footer {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--mj-border);
      text-align: center;
    }

    .security-note {
      font-size: 0.75rem;
      color: var(--mj-text-muted);
      margin: 0;
    }

    .success-message {
      text-align: center;
      padding: 1rem 0;
    }

    .success-message p {
      margin-bottom: 1rem;
    }

    .error-message {
      text-align: center;
      padding: 1rem 0;
    }

    .error-message p {
      margin-bottom: 1rem;
    }

    .error-box {
      background: #fef2f2;
      border: 2px solid #fecaca;
      border-radius: var(--mj-border-radius);
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .error-box h2 {
      color: var(--mj-error);
      margin-bottom: 0.5rem;
    }

    .error-box p {
      color: #991b1b;
      font-size: 0.875rem;
    }

    .provider-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin: 1.5rem 0;
    }

    .provider-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.875rem 1.5rem;
      font-size: 0.9375rem;
      font-weight: 500;
      background: var(--mj-card-bg);
      color: var(--mj-navy);
      border: 2px solid var(--mj-border);
      border-radius: var(--mj-border-radius);
      cursor: pointer;
      transition: all 0.3s ease;
      text-decoration: none;
    }

    .provider-btn:hover {
      background: var(--mj-background);
      border-color: var(--mj-primary);
      transform: translateY(-1px);
    }

    .provider-icon {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
    }

    .retry-link {
      display: inline-block;
      margin-top: 1rem;
      color: var(--mj-primary);
      text-decoration: none;
      font-size: 0.875rem;
    }

    .retry-link:hover {
      text-decoration: underline;
    }

    @media (max-width: 480px) {
      .card {
        padding: 1.5rem;
      }

      .button-group {
        flex-direction: column;
      }

      .btn {
        width: 100%;
      }
    }
  `;
}
