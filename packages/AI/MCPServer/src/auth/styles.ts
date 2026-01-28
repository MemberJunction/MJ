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
      --mj-primary: #2563eb;
      --mj-primary-hover: #1d4ed8;
      --mj-secondary: #64748b;
      --mj-secondary-hover: #475569;
      --mj-success: #22c55e;
      --mj-error: #ef4444;
      --mj-warning: #f59e0b;
      --mj-background: #f8fafc;
      --mj-card-bg: #ffffff;
      --mj-text: #1e293b;
      --mj-text-muted: #64748b;
      --mj-border: #e2e8f0;
      --mj-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
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
      border-radius: 12px;
      box-shadow: var(--mj-shadow);
      padding: 2rem;
    }

    .header {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, var(--mj-primary), #3b82f6);
      color: white;
      font-size: 1.5rem;
      font-weight: 700;
      border-radius: 12px;
      margin-bottom: 1rem;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--mj-text);
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
      border-radius: 8px;
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

    .scope-category {
      margin-bottom: 1.25rem;
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
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .scope-item:hover {
      background: #f1f5f9;
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
      margin-top: 1.5rem;
    }

    .btn {
      flex: 1;
      padding: 0.75rem 1.5rem;
      font-size: 0.9375rem;
      font-weight: 500;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-primary {
      background: var(--mj-primary);
      color: white;
    }

    .btn-primary:hover {
      background: var(--mj-primary-hover);
    }

    .btn-secondary {
      background: var(--mj-background);
      color: var(--mj-secondary);
      border: 1px solid var(--mj-border);
    }

    .btn-secondary:hover {
      background: #f1f5f9;
      color: var(--mj-secondary-hover);
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
      border: 1px solid #fecaca;
      border-radius: 8px;
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
      color: var(--mj-text);
      border: 1px solid var(--mj-border);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
    }

    .provider-btn:hover {
      background: var(--mj-background);
      border-color: var(--mj-primary);
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
