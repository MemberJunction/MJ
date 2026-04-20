/**
 * @fileoverview Login Page HTML Templates for OAuth Proxy
 *
 * Provides HTML templates for the login UI during OAuth flows.
 * These pages provide a better user experience than raw redirects.
 *
 * @module @memberjunction/ai-mcp-server/auth/LoginPage
 */

/**
 * Options for rendering the login page.
 */
export interface LoginPageOptions {
  /** Name of the MCP client requesting access */
  clientName?: string;
  /** Provider name for display (e.g., "Microsoft", "Google") */
  providerName?: string;
  /** URL to redirect to when user clicks continue */
  continueUrl: string;
  /** Resource name (e.g., "MemberJunction MCP Server") */
  resourceName?: string;
  /** Custom logo URL (optional) */
  logoUrl?: string;
}

/**
 * Options for rendering the error page.
 */
export interface ErrorPageOptions {
  /** Error title */
  title: string;
  /** Error message */
  message: string;
  /** Whether to show a "try again" button */
  showRetry?: boolean;
  /** URL to retry (if showRetry is true) */
  retryUrl?: string;
}

/**
 * Options for rendering the success page.
 */
export interface SuccessPageOptions {
  /** Client name that received access */
  clientName?: string;
  /** Message to show (e.g., "You can close this window") */
  message?: string;
}

/**
 * Renders the login consent page.
 *
 * This page is shown when a user arrives at the authorization endpoint
 * to provide context about what they're authorizing.
 */
export function renderLoginPage(options: LoginPageOptions): string {
  const {
    clientName = 'An application',
    providerName = 'your identity provider',
    continueUrl,
    resourceName = 'MemberJunction MCP Server',
    logoUrl,
  } = options;

  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" class="logo" />`
    : `<div class="logo-text">MJ</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In - ${escapeHtml(resourceName)}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 1rem;
    }

    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 420px;
      width: 100%;
      padding: 2.5rem;
      text-align: center;
    }

    .logo {
      width: 80px;
      height: 80px;
      margin-bottom: 1.5rem;
      border-radius: 50%;
      object-fit: cover;
    }

    .logo-text {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      font-weight: 700;
      color: white;
    }

    h1 {
      color: #333;
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }

    .subtitle {
      color: #666;
      font-size: 0.95rem;
      margin-bottom: 2rem;
    }

    .client-name {
      font-weight: 600;
      color: #333;
    }

    .permissions {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 2rem;
      text-align: left;
    }

    .permissions h3 {
      font-size: 0.85rem;
      color: #666;
      margin-bottom: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .permissions ul {
      list-style: none;
    }

    .permissions li {
      font-size: 0.9rem;
      color: #333;
      padding: 0.5rem 0;
      display: flex;
      align-items: center;
    }

    .permissions li::before {
      content: "✓";
      color: #28a745;
      margin-right: 0.75rem;
      font-weight: bold;
    }

    .btn {
      display: inline-block;
      width: 100%;
      padding: 0.875rem 1.5rem;
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
    }

    .btn-primary:active {
      transform: translateY(0);
    }

    .security-note {
      margin-top: 1.5rem;
      font-size: 0.8rem;
      color: #888;
    }

    .security-note a {
      color: #667eea;
    }
  </style>
</head>
<body>
  <div class="card">
    ${logoHtml}
    <h1>Sign In Required</h1>
    <p class="subtitle">
      <span class="client-name">${escapeHtml(clientName)}</span> wants to access
      <span class="client-name">${escapeHtml(resourceName)}</span>
    </p>

    <div class="permissions">
      <h3>This will allow the application to:</h3>
      <ul>
        <li>View your profile information</li>
        <li>Access MemberJunction on your behalf</li>
        <li>Execute MCP tools using your permissions</li>
      </ul>
    </div>

    <a href="${escapeHtml(continueUrl)}" class="btn btn-primary">
      Continue with ${escapeHtml(providerName)}
    </a>

    <p class="security-note">
      You'll be redirected to ${escapeHtml(providerName)} to sign in securely.
    </p>
  </div>
</body>
</html>`;
}

/**
 * Renders an error page.
 */
export function renderErrorPage(options: ErrorPageOptions): string {
  const { title, message, showRetry = false, retryUrl } = options;

  const retryButton = showRetry && retryUrl
    ? `<a href="${escapeHtml(retryUrl)}" class="btn btn-primary">Try Again</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - MemberJunction MCP Server</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 1rem;
    }

    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
      max-width: 420px;
      width: 100%;
      padding: 2.5rem;
      text-align: center;
    }

    .icon-error {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.5rem;
      background: #fee2e2;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
    }

    h1 {
      color: #dc2626;
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }

    p {
      color: #666;
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }

    .btn {
      display: inline-block;
      padding: 0.875rem 2rem;
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      border-radius: 8px;
      transition: transform 0.15s, box-shadow 0.15s;
    }

    .btn-primary {
      background: #667eea;
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-error">⚠️</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${retryButton}
  </div>
</body>
</html>`;
}

/**
 * Renders a success page.
 */
export function renderSuccessPage(options: SuccessPageOptions): string {
  const {
    clientName = 'The application',
    message = 'You can now close this window and return to your application.',
  } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Successful - MemberJunction MCP Server</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 1rem;
    }

    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 420px;
      width: 100%;
      padding: 2.5rem;
      text-align: center;
    }

    .icon-success {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      background: #d1fae5;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.5rem;
    }

    h1 {
      color: #059669;
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }

    .client-name {
      color: #333;
      font-weight: 600;
    }

    p {
      color: #666;
      font-size: 0.95rem;
      line-height: 1.6;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-success">✓</div>
    <h1>Authentication Successful!</h1>
    <p>
      <span class="client-name">${escapeHtml(clientName)}</span> has been granted access.
    </p>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

/**
 * Escapes HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
