import { describe, it, expect } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import { AITestHarnessComponent } from './ai-test-harness.component';

/**
 * Phone layout of the AI test harness (inside the full-screen mj-window). On a phone the chat and
 * the settings sidebar do not sit side by side: the chat shows, and the sidebar toggle swaps the
 * whole pane to settings and back. The rest of the component needs the AI runtime, so this drives
 * the phone state on a bare instance.
 */
function harness(): AITestHarnessComponent {
  const h = Object.create(AITestHarnessComponent.prototype) as AITestHarnessComponent;
  Object.assign(h, { ShowSidebar: true, IsPhone: false, cdr: { markForCheck: () => undefined } as unknown as ChangeDetectorRef });
  return h;
}

describe('AITestHarnessComponent on phones', () => {
  it('starts on the chat with the settings sidebar closed', () => {
    const h = harness();
    h.ApplyPhoneViewport(true);
    expect(h.IsPhone).toBe(true);
    expect(h.ShowSidebar).toBe(false);
  });

  it('swaps the whole pane to settings when the toggle opens the sidebar', () => {
    const h = harness();
    h.ApplyPhoneViewport(true);
    h.ToggleSidebar();
    expect(h.ShowSidebar).toBe(true);
    expect(h.ChatPaneVisible).toBe(false);
    h.ToggleSidebar();
    expect(h.ChatPaneVisible).toBe(true);
  });

  it('keeps chat and sidebar side by side on desktop, and reopens the sidebar on the way back', () => {
    const h = harness();
    expect(h.ChatPaneVisible).toBe(true);
    h.ApplyPhoneViewport(true);
    h.ApplyPhoneViewport(false);
    expect(h.ShowSidebar).toBe(true);
    expect(h.ChatPaneVisible).toBe(true);
  });

  it('names the toggle by what it opens', () => {
    const h = harness();
    h.ApplyPhoneViewport(true);
    expect(h.SidebarToggleLabel).toBe('Show settings');
    h.ToggleSidebar();
    expect(h.SidebarToggleLabel).toBe('Back to chat');
    h.ApplyPhoneViewport(false);
    expect(h.SidebarToggleLabel).toBe('Hide sidebar');
  });
});
