/**
 * MemberJunction Explorer - Application Component
 *
 * MJ 3.0 Minimal App Shell Pattern:
 * Reduced from 158 lines to 12 lines by using @memberjunction/ng-explorer-app
 */

import { Component } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-root',
  template: '<mj-explorer-app />'
})
export class AppComponent {
  constructor(private workspaceManager: WorkspaceStateManager) {}

  /**
   * Provides the current page/tab name(s) for feedback context.
   * Returns all open tab names joined with " | " when multiple tabs exist.
   * Arrow function to preserve 'this' context when passed as callback.
   */
  GetCurrentPage = (): string | undefined => {
    const config = this.workspaceManager.GetConfiguration();
    console.log('[Feedback] config:', config);
    console.log('[Feedback] tabs:', config?.tabs);
    if (!config?.tabs?.length) {
      console.log('[Feedback] No tabs found');
      return undefined;
    }
    // Return all tab titles joined together when multiple tabs are open
    // Use " → " separator to avoid markdown table conflicts with pipe character
    const titles = config.tabs.map(t => t.title).filter(Boolean);
    console.log('[Feedback] titles:', titles);
    const result = titles.length > 0 ? titles.join(' → ') : undefined;
    console.log('[Feedback] result:', result);
    return result;
  };
}