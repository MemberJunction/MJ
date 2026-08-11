// The component is decorated with @Component; importing it triggers Angular's JIT path,
// which needs the compiler present (the render-based DOM tests get this via ng-test-utils).
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJChatEmptyStateDefaultComponent } from '../lib/components/slots/mj-chat-empty-state-default.component';

/**
 * The default `emptyState` slot component ships with generic starter prompts so a business
 * user never faces a blank box, while still letting a host override or suppress them. The
 * subtle contract is the null-coalescing fallback: `undefined` → defaults, but an explicit
 * empty array → nothing (a deliberate "no chips" from the host). These tests lock that in.
 */
describe('MJChatEmptyStateDefaultComponent.EffectiveSuggestedPrompts', () => {
  it('shows the built-in default prompts when the host supplies none', () => {
    const c = new MJChatEmptyStateDefaultComponent();
    expect(c.EffectiveSuggestedPrompts).toBe(MJChatEmptyStateDefaultComponent.DefaultSuggestedPrompts);
    expect(c.EffectiveSuggestedPrompts.length).toBeGreaterThan(0);
  });

  it('uses the host-supplied prompts when provided', () => {
    const c = new MJChatEmptyStateDefaultComponent();
    c.SuggestedPrompts = ['Custom one', 'Custom two'];
    expect(c.EffectiveSuggestedPrompts).toEqual(['Custom one', 'Custom two']);
  });

  it('renders nothing when the host explicitly passes an empty array (suppression)', () => {
    const c = new MJChatEmptyStateDefaultComponent();
    c.SuggestedPrompts = [];
    expect(c.EffectiveSuggestedPrompts).toEqual([]);
  });
});
