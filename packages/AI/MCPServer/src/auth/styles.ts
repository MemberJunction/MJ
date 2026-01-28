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
      padding: 0.5rem 0;
      user-select: none;
    }

    .category-header:hover {
      color: var(--mj-navy);
    }

    .category-toggle {
      font-size: 0.75rem;
      color: var(--mj-text-muted);
      transition: transform 0.2s ease;
    }

    .category-count {
      font-size: 0.75rem;
      font-weight: 400;
      color: var(--mj-text-muted);
      margin-left: auto;
    }

    .scope-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .scope-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem;
      background: var(--mj-background);
      border-radius: var(--mj-border-radius);
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .scope-item:hover {
      background: var(--mj-light-blue);
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
