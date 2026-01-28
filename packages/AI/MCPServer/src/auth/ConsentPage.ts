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
 * Inline SVG logo for MemberJunction.
 * Using inline SVG avoids distributing a separate file.
 */
const MJ_LOGO_SVG = `<svg class="logo-svg" viewBox="0 0 230 128" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 0 C1.19723096 0.66803089 2.39449723 1.33599849 3.59179688 2.00390625 C12.23367889 6.83656898 20.79234313 11.80468424 29.3269043 16.82446289 C37.26006572 21.47598503 45.26946418 25.97974601 53.3125 30.4375 C53.9096582 30.76854736 54.50681641 31.09959473 55.12207031 31.44067383 C61.23357052 34.8698905 61.23357052 34.8698905 67.4375 38.125 C69.70881474 37.16024733 69.70881474 37.16024733 72.2578125 35.65234375 C73.25538574 35.08974854 74.25295898 34.52715332 75.28076172 33.94750977 C76.36373535 33.32545654 77.44670898 32.70340332 78.5625 32.0625 C79.68543457 31.42562256 80.80836914 30.78874512 81.96533203 30.13256836 C90.43486972 25.32216949 98.84024403 20.40137187 107.23901367 15.46875 C118.24205294 9.02706584 129.39403519 2.85738056 140.56591797 -3.28564453 C142.40994953 -4.30627414 144.24810917 -5.33762719 146.07861328 -6.38232422 C146.86864746 -6.83236816 147.65868164 -7.28241211 148.47265625 -7.74609375 C149.14820557 -8.13595459 149.82375488 -8.52581543 150.51977539 -8.92749023 C156.44790805 -11.85646323 163.03553477 -11.67565508 169.1875 -9.625 C175.63762987 -6.15185315 178.91499247 -2.71186288 181.4375 4.125 C181.9505428 7.25897952 181.94642813 10.30848048 181.89160156 13.47851562 C181.89218567 14.37701233 181.89276978 15.27550903 181.89337158 16.20123291 C181.89060449 19.14497714 181.85957802 22.08768461 181.828125 25.03125 C181.82065771 27.08247322 181.81496709 29.1337036 181.81097412 31.18493652 C181.79575626 36.56416783 181.75650758 41.942962 181.7121582 47.32202148 C181.6711224 52.81878752 181.65294538 58.31562469 181.6328125 63.8125 C181.59000962 74.5835246 181.52180498 85.35422584 181.4375 96.125 C178.57319731 94.73855561 175.72898811 93.32592774 172.90081787 91.86671448 C170.64445833 90.7319835 168.34886551 89.67124686 166.01763916 88.6995697 C162.6275495 87.12693928 160.11993284 85.73570051 157.4375 83.125 C155.74092526 78.08220831 155.89309155 73.24414552 156.046875 68.00390625 C156.0468186 66.53416516 156.04146675 65.0644156 156.03106689 63.5947113 C156.01793344 59.74450768 156.07626166 55.89864524 156.14996338 52.04925537 C156.21250363 48.11430443 156.20681901 44.17950119 156.20703125 40.24414062 C156.21742533 32.53630603 156.30337836 24.83178056 156.4375 17.125 C152.4853108 19.33528321 148.53362968 21.54647329 144.58203125 23.7578125 C143.47605591 24.3763208 142.37008057 24.9948291 141.23059082 25.63208008 C131.89544195 30.85701529 122.60108265 36.15057231 113.32080078 41.47216797 C107.73703387 44.67302334 102.14999724 47.86816239 96.5625 51.0625 C95.96480804 51.40424255 95.36711609 51.74598511 94.75131226 52.0980835 C86.8256602 56.62889921 78.88891645 61.13951382 70.9375 65.625 C62.52677948 70.36988673 54.13334981 75.14445793 45.75 79.9375 C45.16563171 80.27148804 44.58126343 80.60547607 43.97918701 80.94958496 C37.98672731 84.37461317 31.99620535 87.80296132 26.01121521 91.24102783 C14.36571156 97.9301577 2.70745383 104.59384834 -9.0625 111.0625 C-9.9704834 111.56491211 -10.8784668 112.06732422 -11.81396484 112.58496094 C-12.64879395 113.04032227 -13.48362305 113.49568359 -14.34375 113.96484375 C-15.06626953 114.36050537 -15.78878906 114.75616699 -16.53320312 115.16381836 C-22.26914695 117.88066278 -28.60247915 117.94929758 -34.625 116.125 C-39.39821065 114.14955242 -42.88094245 110.49091089 -45.5625 106.125 C-45.5625 104.805 -45.5625 103.485 -45.5625 102.125 C-45.02173828 101.8347998 -44.48097656 101.54459961 -43.92382812 101.24560547 C-32.12193965 94.89702045 -20.45618983 88.36337308 -8.90722656 81.56567383 C-0.01717223 76.35018484 8.97457487 71.33320596 18.00268555 66.36206055 C24.42686178 62.82040812 30.77655178 59.18554479 37.06542969 55.40795898 C39.4375 54.125 39.4375 54.125 41.4375 54.125 C41.4375 53.465 41.4375 52.805 41.4375 52.125 C40.70442627 51.84301758 39.97135254 51.56103516 39.21606445 51.27050781 C36.70241681 50.23421621 34.36781471 49.09270743 31.98046875 47.796875 C30.70042969 47.10223145 30.70042969 47.10223145 29.39453125 46.39355469 C28.48058594 45.89243164 27.56664063 45.39130859 26.625 44.875 C25.6659375 44.35067383 24.706875 43.82634766 23.71875 43.28613281 C14.4774413 38.20221752 5.37027743 32.89699088 -3.71875 27.546875 C-8.10317177 24.9683496 -12.50944296 22.43092952 -16.92773438 19.91113281 C-17.8897879 19.36194687 -17.8897879 19.36194687 -18.87127686 18.80166626 C-20.43485366 17.90915637 -21.99865352 17.01703728 -23.5625 16.125 C-23.5247496 16.94217499 -23.48699921 17.75934998 -23.44810486 18.60128784 C-23.10613403 26.338231 -22.84805779 34.07147339 -22.68169308 41.81402397 C-22.59326923 45.7943551 -22.47365738 49.7684048 -22.2800293 53.74511719 C-21.05961395 79.46119215 -21.05961395 79.46119215 -25.2053833 85.52990723 C-29.1476309 89.11038232 -33.51654405 90.99569509 -38.58108521 92.48980713 C-41.15915208 93.31627199 -43.28157869 94.68833841 -45.5625 96.125 C-46.2225 96.125 -46.8825 96.125 -47.5625 96.125 C-47.65536351 84.54596298 -47.72634802 72.96701521 -47.76974869 61.38768101 C-47.79058358 56.01035427 -47.81882637 50.63328316 -47.86425781 45.25610352 C-47.90786166 40.06246887 -47.93166791 34.86907943 -47.94200897 29.6752758 C-47.94937427 27.69821249 -47.96375687 25.72116191 -47.98542023 23.74420357 C-48.01464757 20.96532788 -48.01844796 18.18745301 -48.01660156 15.40844727 C-48.03098267 14.59923828 -48.04536377 13.7900293 -48.06018066 12.95629883 C-48.0129686 6.34803692 -46.3909882 0.19630842 -41.82281876 -4.7640295 C-27.89533054 -17.46638924 -13.81656068 -7.74745544 0 0 Z " fill="#264FAF" transform="translate(47.5625,10.875)"/>
  <path d="M0 0 C2.05102539 0.96118164 2.05102539 0.96118164 4.09765625 2.16015625 C5.27763184 2.84343994 5.27763184 2.84343994 6.48144531 3.54052734 C7.33319336 4.04277832 8.18494141 4.5450293 9.0625 5.0625 C10.95423657 6.16048455 12.84617425 7.25812266 14.73828125 8.35546875 C16.25542725 9.23984619 16.25542725 9.23984619 17.80322266 10.14208984 C22.84777072 13.07389149 27.91305609 15.96933026 32.97946167 18.86312866 C34.75277508 19.87658597 36.5250105 20.89190852 38.29711914 21.9074707 C44.24304114 25.31104557 50.20518192 28.6810523 56.203125 31.9921875 C57.3468457 32.62527832 58.49056641 33.25836914 59.66894531 33.91064453 C61.83686228 35.10773383 64.00793913 36.29912425 66.18261719 37.48388672 C67.15360352 38.02029785 68.12458984 38.55670898 69.125 39.109375 C69.97320312 39.57311523 70.82140625 40.03685547 71.6953125 40.51464844 C74.14878587 42.09589123 76.01488727 43.86966301 78 46 C74.98437042 51.80787919 72.39526814 55.4566963 66.25 58.25 C54.15934934 61.04015015 44.85713477 55.77830547 34.625 49.75 C32.78144314 48.68065653 30.93768206 47.6116651 29.09375 46.54296875 C28.1140625 45.97239746 27.134375 45.40182617 26.125 44.81396484 C21.06765116 41.87833188 15.98874165 38.98044798 10.91021729 36.08166504 C9.12971114 35.06518955 7.34971514 34.04782576 5.56982422 33.03027344 C-5.59802158 26.64774214 -16.79398834 20.31528015 -28 14 C-28 13.34 -28 12.68 -28 12 C-24.28438346 9.78884432 -20.55059892 7.61039613 -16.8125 5.4375 C-15.75740234 4.80908203 -14.70230469 4.18066406 -13.61523438 3.53320312 C-12.08286133 2.64858398 -12.08286133 2.64858398 -10.51953125 1.74609375 C-9.58214111 1.19622803 -8.64475098 0.6463623 -7.67895508 0.07983398 C-4.51842941 -1.19411161 -3.19612477 -1.06925843 0 0 Z " fill="#264FAF" transform="translate(150,69)"/>
</svg>`;

/**
 * Renders the consent page HTML.
 *
 * @param consentRequest - The consent request containing user and scope info
 * @returns HTML string for the consent page
 */
export function renderConsentPage(consentRequest: ConsentRequest): string {
  const { user, availableScopes, clientId, requestId } = consentRequest;
  const groupedScopes = groupScopesByCategory(availableScopes);

  const scopeCheckboxes = renderScopeCheckboxes(groupedScopes, consentRequest.requestedScope);

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
        ${MJ_LOGO_SVG}
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

        <div class="button-group">
          <button type="submit" name="action" value="approve" class="btn btn-primary">
            Authorize
          </button>
          <button type="submit" name="action" value="deny" class="btn btn-secondary">
            Deny
          </button>
        </div>

        <div class="scope-section">
          <h2>Select Permissions</h2>
          <p class="scope-description">Choose which permissions to grant this application:</p>

          ${scopeCheckboxes}
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
 * Per FR-030: Two-tier UI with "Grant All" at top, collapsible categories below.
 * Per FR-030a: No scopes pre-selected by default.
 *
 * @param groupedScopes - Scopes grouped by category
 * @param requestedScope - Optional scope string from client request (space-delimited)
 */
function renderScopeCheckboxes(
  groupedScopes: Map<string, APIScopeInfo[]>,
  requestedScope?: string
): string {
  const categories: string[] = [];

  // Count total scopes for "Grant All" label
  let totalScopes = 0;
  for (const scopes of groupedScopes.values()) {
    totalScopes += scopes.length;
  }

  // Grant All checkbox (FR-030)
  const grantAllSection = `
    <div class="grant-all-section">
      <label class="grant-all-item">
        <input type="checkbox" id="grant-all-checkbox" onchange="toggleAllScopes(this.checked)">
        <span class="grant-all-label">Grant All Permissions</span>
        <span class="grant-all-desc">Select all ${totalScopes} available scopes</span>
      </label>
    </div>
  `;

  for (const [category, scopes] of groupedScopes) {
    const scopeItems = scopes
      .map(
        (scope) => `
        <label class="scope-item">
          <input type="checkbox" name="scopes" value="${escapeHtml(scope.Name)}" class="scope-checkbox">
          <span class="scope-name">${escapeHtml(scope.Name)}</span>
          <span class="scope-desc">${escapeHtml(scope.Description)}</span>
        </label>`
      )
      .join('');

    categories.push(`
      <div class="scope-category">
        <h3 class="category-header" onclick="toggleCategory(this)">
          <span class="category-toggle">▼</span>
          ${escapeHtml(category)}
          <span class="category-count">(${scopes.length})</span>
        </h3>
        <div class="scope-list">
          ${scopeItems}
        </div>
      </div>
    `);
  }

  // JavaScript for Grant All and category toggle functionality
  const script = `
    <script>
      function toggleAllScopes(checked) {
        const checkboxes = document.querySelectorAll('.scope-checkbox');
        checkboxes.forEach(cb => cb.checked = checked);
      }

      function toggleCategory(header) {
        const scopeList = header.nextElementSibling;
        const toggle = header.querySelector('.category-toggle');
        if (scopeList.style.display === 'none') {
          scopeList.style.display = 'block';
          toggle.textContent = '▼';
        } else {
          scopeList.style.display = 'none';
          toggle.textContent = '▶';
        }
      }

      // Update Grant All checkbox when individual scopes change
      document.addEventListener('change', function(e) {
        if (e.target.classList.contains('scope-checkbox')) {
          const all = document.querySelectorAll('.scope-checkbox');
          const checked = document.querySelectorAll('.scope-checkbox:checked');
          document.getElementById('grant-all-checkbox').checked = (all.length === checked.length);
        }
      });
    </script>
  `;

  return grantAllSection + categories.join('') + script;
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
        ${MJ_LOGO_SVG}
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
        ${MJ_LOGO_SVG}
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
