/**
 * @fileoverview Consent Page for OAuth Authorization
 *
 * Renders an HTML consent screen where users can select which scopes
 * to grant to the requesting MCP client application.
 *
 * @module @memberjunction/ai-mcp-server/auth/ConsentPage
 */

import type { ConsentRequest } from './types.js';
import { groupScopesHierarchically, type HierarchicalScopeGroups, type ScopePrefixGroup } from './ScopeService.js';
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
  const hierarchicalGroups = groupScopesHierarchically(availableScopes);

  const scopeCheckboxes = renderScopeCheckboxes(hierarchicalGroups, consentRequest.requestedScope);

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
 * Renders a single prefix group (parent scope with its children).
 * @param isSingleInCategory - If true, this is the only parent in its category (renders inline with category)
 */
function renderPrefixGroup(
  group: ScopePrefixGroup,
  categoryId: string,
  groupIndex: number,
  isSingleInCategory: boolean = false
): string {
  const groupId = `${categoryId}-group-${groupIndex}`;
  const parentScope = group.parent;
  const children = group.children;

  if (!parentScope && children.length === 0) {
    return '';
  }

  // If we have a parent scope with children, render hierarchically with collapsible children
  if (parentScope && children.length > 0) {
    const childItems = children
      .map(
        (child) => `
        <label class="scope-item scope-child" data-parent="${escapeHtml(parentScope.FullPath)}">
          <input type="checkbox" name="scopes" value="${escapeHtml(child.FullPath)}"
                 class="scope-checkbox child-scope" data-parent-scope="${escapeHtml(parentScope.FullPath)}"
                 onchange="handleChildScopeChange(this)">
          <span class="scope-name">${escapeHtml(child.FullPath)}</span>
          <span class="scope-desc">${escapeHtml(child.Description)}</span>
        </label>`
      )
      .join('');

    // If single parent in category, render more compactly (category acts as container)
    if (isSingleInCategory) {
      return `
        <div class="prefix-group single-in-category" id="${groupId}">
          <div class="parent-scope-header">
            <input type="checkbox" name="scopes" value="${escapeHtml(parentScope.FullPath)}"
                   class="scope-checkbox parent-scope" data-group-id="${groupId}" data-child-count="${children.length}"
                   onchange="handleParentScopeChange(this)">
            <div class="scope-content">
              <span class="scope-desc">${escapeHtml(parentScope.Description)}</span>
              </div>
            <span class="children-toggle" onclick="toggleChildren('${groupId}')">&#9654;</span>
          </div>
          <div class="scope-children" style="display: none;">
            ${childItems}
          </div>
        </div>
      `;
    }

    return `
      <div class="prefix-group" id="${groupId}">
        <div class="parent-scope-header">
          <input type="checkbox" name="scopes" value="${escapeHtml(parentScope.FullPath)}"
                 class="scope-checkbox parent-scope" data-group-id="${groupId}" data-child-count="${children.length}"
                 onchange="handleParentScopeChange(this)">
          <div class="scope-content">
            <span class="scope-name">${escapeHtml(parentScope.FullPath)}</span>
            <span class="scope-desc">${escapeHtml(parentScope.Description)}</span>
          </div>
          <span class="children-toggle" onclick="toggleChildren('${groupId}')">&#9654;</span>
        </div>
        <div class="scope-children" style="display: none;">
          ${childItems}
        </div>
      </div>
    `;
  }

  // Parent scope with no children
  if (parentScope) {
    return `
      <div class="prefix-group" id="${groupId}">
        <label class="scope-item scope-parent standalone">
          <input type="checkbox" name="scopes" value="${escapeHtml(parentScope.FullPath)}"
                 class="scope-checkbox parent-scope">
          <span class="scope-name">${escapeHtml(parentScope.FullPath)}</span>
          <span class="scope-desc">${escapeHtml(parentScope.Description)}</span>
        </label>
      </div>
    `;
  }

  // Orphaned children (no parent in this category)
  const orphanItems = children
    .map(
      (child) => `
      <label class="scope-item">
        <input type="checkbox" name="scopes" value="${escapeHtml(child.FullPath)}" class="scope-checkbox">
        <span class="scope-name">${escapeHtml(child.FullPath)}</span>
        <span class="scope-desc">${escapeHtml(child.Description)}</span>
      </label>`
    )
    .join('');

  return `
    <div class="prefix-group orphaned" id="${groupId}">
      ${orphanItems}
    </div>
  `;
}

/**
 * Renders scope checkboxes with hierarchical grouping.
 *
 * Features:
 * - full_access scope at top with special treatment (acts as global grant all)
 * - Categories collapsed by default
 * - Within categories, scopes grouped by parent prefix
 * - Selecting parent scope implies all children (children shown as selected + disabled)
 * - Select all/none per category
 * - LocalStorage persistence for scope selections
 *
 * @param hierarchicalGroups - Hierarchically grouped scopes
 * @param requestedScope - Optional scope string from client request (space-delimited)
 */
function renderScopeCheckboxes(
  hierarchicalGroups: HierarchicalScopeGroups,
  _requestedScope?: string // Reserved for future: pre-select client-requested scopes
): string {
  const { fullAccessScope, categories } = hierarchicalGroups;

  // Count total scopes for display
  let totalScopes = fullAccessScope ? 1 : 0;
  for (const prefixGroups of categories.values()) {
    for (const group of prefixGroups) {
      if (group.parent) totalScopes++;
      totalScopes += group.children.length;
    }
  }

  // full_access scope with special UI treatment (replaces "Grant All" checkbox)
  // Also add a global "Clear All" button
  const fullAccessSection = `
    <div class="full-access-section">
      ${
        fullAccessScope
          ? `
      <label class="full-access-item">
        <input type="checkbox" id="full-access-checkbox" name="scopes" value="full_access"
               class="scope-checkbox" onchange="handleFullAccessChange(this.checked)">
        <div class="full-access-content">
          ${fullAccessScope.UIConfig?.icon ? `<i class="${escapeHtml(fullAccessScope.UIConfig.icon)} full-access-icon"></i>` : ''}
          <div class="full-access-text">
            <span class="full-access-label">Full Access</span>
            <span class="full-access-desc">${escapeHtml(fullAccessScope.Description)}</span>
          </div>
        </div>
      </label>
      `
          : ''
      }
      <button type="button" class="clear-all-btn" onclick="clearAllScopes()">
        <i class="fa-solid fa-xmark"></i> Clear All Selections
      </button>
    </div>
  `;

  // Render categories (default collapsed)
  const categoryElements: string[] = [];
  let categoryIndex = 0;

  for (const [category, prefixGroups] of categories) {
    const categoryId = `category-${categoryIndex}`;
    categoryIndex++;

    // Count scopes in this category
    let categoryTotal = 0;
    for (const group of prefixGroups) {
      if (group.parent) categoryTotal++;
      categoryTotal += group.children.length;
    }

    // Get category icon and color from first parent scope with UIConfig
    let categoryIcon = '';
    let categoryColor = '';
    for (const group of prefixGroups) {
      if (group.parent?.UIConfig) {
        categoryIcon = group.parent.UIConfig.icon ?? '';
        categoryColor = group.parent.UIConfig.color ?? '';
        break;
      }
    }

    // Check if this is a single-parent category (one parent with children, no orphans)
    const isSingleParentCategory =
      prefixGroups.length === 1 && prefixGroups[0].parent !== null && prefixGroups[0].children.length > 0;

    const prefixGroupsHtml = prefixGroups
      .map((group, idx) => renderPrefixGroup(group, categoryId, idx, isSingleParentCategory))
      .join('');

    // For single-parent categories, integrate the parent checkbox directly into the category header
    // This avoids double-clicking: users expand category and immediately see leaf scopes
    if (isSingleParentCategory) {
      const singleParent = prefixGroups[0].parent!;
      const singleChildren = prefixGroups[0].children;
      const groupId = `${categoryId}-group-0`;

      // Render just the children (parent checkbox is in header)
      const childItems = singleChildren
        .map(
          (child) => `
          <label class="scope-item scope-child" data-parent="${escapeHtml(singleParent.FullPath)}">
            <input type="checkbox" name="scopes" value="${escapeHtml(child.FullPath)}"
                   class="scope-checkbox child-scope" data-parent-scope="${escapeHtml(singleParent.FullPath)}"
                   onchange="handleChildScopeChange(this)">
            <span class="scope-name">${escapeHtml(child.FullPath)}</span>
            <span class="scope-desc">${escapeHtml(child.Description)}</span>
          </label>`
        )
        .join('');

      categoryElements.push(`
        <div class="scope-category single-parent" id="${categoryId}">
          <div class="category-header integrated-parent" data-group-id="${groupId}">
            <span class="category-toggle" onclick="event.stopPropagation(); toggleCategory('${categoryId}')">&#9654;</span>
            ${categoryIcon ? `<i class="${escapeHtml(categoryIcon)}" style="color: ${escapeHtml(categoryColor)}"></i>` : ''}
            <span class="category-name">${escapeHtml(category)}</span>
            <span class="category-count">(${categoryTotal})</span>
            <label class="integrated-parent-checkbox" onclick="event.stopPropagation()">
              <input type="checkbox" name="scopes" value="${escapeHtml(singleParent.FullPath)}"
                     class="scope-checkbox parent-scope" data-group-id="${groupId}" data-child-count="${singleChildren.length}"
                     onchange="handleParentScopeChange(this)">
            </label>
            <span class="integrated-parent-desc">${escapeHtml(singleParent.Description)}</span>
          </div>
          <div class="scope-list" style="display: none;">
            <div class="scope-children" id="${groupId}" style="display: flex;">
              ${childItems}
            </div>
          </div>
        </div>
      `);
    } else {
      categoryElements.push(`
        <div class="scope-category" id="${categoryId}">
          <div class="category-header" onclick="toggleCategory('${categoryId}')">
            <span class="category-toggle">&#9654;</span>
            ${categoryIcon ? `<i class="${escapeHtml(categoryIcon)}" style="color: ${escapeHtml(categoryColor)}"></i>` : ''}
            <span class="category-name">${escapeHtml(category)}</span>
            <span class="category-count">(${categoryTotal})</span>
            <button type="button" class="category-select-btn" onclick="event.stopPropagation(); toggleCategoryScopes('${categoryId}', true)">All</button>
            <button type="button" class="category-select-btn" onclick="event.stopPropagation(); toggleCategoryScopes('${categoryId}', false)">None</button>
          </div>
          <div class="scope-list" style="display: none;">
            ${prefixGroupsHtml}
          </div>
        </div>
      `);
    }
  }

  // JavaScript for all interactive functionality
  const script = `
    <script>
      const STORAGE_KEY = 'mj_oauth_selected_scopes';

      // Initialize on page load
      document.addEventListener('DOMContentLoaded', function() {
        loadSavedScopes();
        updateAllParentStates();
      });

      // Handle full_access checkbox - when checked, visually indicate all scopes are granted
      function handleFullAccessChange(checked) {
        // Only affect parent scopes - children are already implied by parents
        const parentCheckboxes = document.querySelectorAll('.parent-scope');
        const standaloneCheckboxes = document.querySelectorAll('.scope-checkbox:not(.parent-scope):not(.child-scope):not(#full-access-checkbox)');

        parentCheckboxes.forEach(cb => {
          cb.disabled = checked;
          if (checked) {
            cb.checked = true;
            // Also disable children of this parent
            const parentScope = cb.value;
            document.querySelectorAll('input.child-scope[data-parent-scope="' + parentScope + '"]').forEach(child => {
              child.disabled = true;
              child.checked = true;
            });
          }
        });

        standaloneCheckboxes.forEach(cb => {
          cb.disabled = checked;
          if (checked) cb.checked = true;
        });

        saveSelectedScopes();
      }

      // Clear all scope selections
      function clearAllScopes() {
        const fullAccessCb = document.getElementById('full-access-checkbox');
        if (fullAccessCb) {
          fullAccessCb.checked = false;
        }

        // Re-enable and uncheck all parent scopes
        document.querySelectorAll('.parent-scope').forEach(cb => {
          cb.disabled = false;
          cb.checked = false;
        });

        // Re-enable and uncheck all child scopes
        document.querySelectorAll('.child-scope').forEach(cb => {
          cb.disabled = false;
          cb.checked = false;
        });

        // Uncheck any standalone scopes
        document.querySelectorAll('.scope-checkbox:not(.parent-scope):not(.child-scope):not(#full-access-checkbox)').forEach(cb => {
          cb.disabled = false;
          cb.checked = false;
        });

        saveSelectedScopes();
      }

      // Handle parent scope checkbox - when checked, disable and check all children; when unchecked, enable and uncheck all children
      function handleParentScopeChange(checkbox) {
        const parentScope = checkbox.value;
        const isChecked = checkbox.checked;

        // Find all child checkboxes for this parent
        const childCheckboxes = document.querySelectorAll('input.child-scope[data-parent-scope="' + parentScope + '"]');
        childCheckboxes.forEach(child => {
          child.disabled = isChecked;
          // When checked, select all children; when unchecked, clear all children
          child.checked = isChecked;
        });

        saveSelectedScopes();
      }

      // Handle child scope checkbox - auto-select parent if all children are selected
      function handleChildScopeChange(checkbox) {
        const parentScope = checkbox.dataset.parentScope;
        if (!parentScope) return;

        // Find the parent checkbox and all siblings
        const parentCb = document.querySelector('input.parent-scope[value="' + parentScope + '"]');
        if (!parentCb) return;

        const allChildren = document.querySelectorAll('input.child-scope[data-parent-scope="' + parentScope + '"]');
        const checkedChildren = document.querySelectorAll('input.child-scope[data-parent-scope="' + parentScope + '"]:checked');

        // If all children are checked, auto-select the parent
        if (allChildren.length > 0 && allChildren.length === checkedChildren.length) {
          parentCb.checked = true;
          handleParentScopeChange(parentCb);
        }

        saveSelectedScopes();
      }

      // Toggle category expand/collapse
      function toggleCategory(categoryId) {
        const category = document.getElementById(categoryId);
        if (!category) return;

        const scopeList = category.querySelector('.scope-list');
        const toggle = category.querySelector('.category-toggle');

        if (scopeList.style.display === 'none') {
          scopeList.style.display = 'block';
          toggle.innerHTML = '&#9660;';
        } else {
          scopeList.style.display = 'none';
          toggle.innerHTML = '&#9654;';
        }
      }

      // Toggle children visibility within a prefix group
      function toggleChildren(groupId) {
        const group = document.getElementById(groupId);
        if (!group) return;

        const children = group.querySelector('.scope-children');
        const toggle = group.querySelector('.children-toggle');

        if (children.style.display === 'none') {
          children.style.display = 'flex';
          toggle.innerHTML = '&#9660;';
        } else {
          children.style.display = 'none';
          toggle.innerHTML = '&#9654;';
        }
      }

      // Select all/none for a category
      function toggleCategoryScopes(categoryId, selectAll) {
        const category = document.getElementById(categoryId);
        if (!category) return;

        // Don't modify if full_access is checked
        if (document.getElementById('full-access-checkbox')?.checked) return;

        // When selecting all, just select parent scopes (which implies children)
        // When deselecting, deselect parents and re-enable children
        const parentCheckboxes = category.querySelectorAll('.parent-scope:not(:disabled)');
        parentCheckboxes.forEach(cb => {
          cb.checked = selectAll;
          handleParentScopeChange(cb);
        });

        // Handle standalone scopes (no parent/child relationship)
        const standaloneCheckboxes = category.querySelectorAll('.scope-checkbox:not(.parent-scope):not(.child-scope):not(:disabled)');
        standaloneCheckboxes.forEach(cb => {
          cb.checked = selectAll;
        });

        saveSelectedScopes();
      }

      // Update parent checkbox states based on children
      function updateAllParentStates() {
        document.querySelectorAll('.parent-scope').forEach(parent => {
          if (parent.checked) {
            handleParentScopeChange(parent);
          }
        });
      }

      // Save selected scopes to localStorage
      function saveSelectedScopes() {
        const selected = [];
        document.querySelectorAll('.scope-checkbox:checked').forEach(cb => {
          // Only save non-disabled checkboxes OR full_access
          if (!cb.disabled || cb.id === 'full-access-checkbox') {
            selected.push(cb.value);
          }
        });
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
        } catch (e) {
          // localStorage may not be available
        }
      }

      // Load saved scopes from localStorage
      function loadSavedScopes() {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (!saved) return;

          const selectedScopes = JSON.parse(saved);
          if (!Array.isArray(selectedScopes)) return;

          // Check full_access first if it was saved
          if (selectedScopes.includes('full_access')) {
            const fullAccessCb = document.getElementById('full-access-checkbox');
            if (fullAccessCb) {
              fullAccessCb.checked = true;
              handleFullAccessChange(true);
              return;
            }
          }

          // Check individual scopes (parents first to set up disabled state)
          document.querySelectorAll('.parent-scope').forEach(cb => {
            if (selectedScopes.includes(cb.value)) {
              cb.checked = true;
              handleParentScopeChange(cb);
            }
          });

          // Then check remaining child scopes (only if not already disabled by parent)
          document.querySelectorAll('.child-scope').forEach(cb => {
            if (selectedScopes.includes(cb.value) && !cb.disabled) {
              cb.checked = true;
            }
          });
        } catch (e) {
          // localStorage may not be available or data may be invalid
        }
      }

      // Update localStorage when any scope changes
      document.addEventListener('change', function(e) {
        if (e.target.classList.contains('scope-checkbox')) {
          saveSelectedScopes();
        }
      });
    </script>
  `;

  return fullAccessSection + categoryElements.join('') + script;
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
