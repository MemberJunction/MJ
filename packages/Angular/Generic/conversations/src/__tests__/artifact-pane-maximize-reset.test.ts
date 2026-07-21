// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import {
  ConversationChatAreaComponent,
  DEFAULT_ARTIFACT_PANE_WIDTH
} from '../lib/components/conversation/conversation-chat-area.component';

/**
 * Regression coverage for the maximized-artifact-pane leak across conversation switches:
 * maximizing sets both isArtifactPaneMaximized and artifactPaneWidth=100, but the
 * conversation-switch reset originally cleared only the flag — so the next artifact
 * opened in another conversation rendered at 100% width WITHOUT the .maximized class
 * and overflowed the viewport.
 *
 * Exercised WITHOUT TestBed: the component is created via Object.create(prototype)
 * so the real methods run against directly-seeded state.
 */

function createComponent(): ConversationChatAreaComponent {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;

  // Object.create skips field initializers — seed the pane state the methods read.
  component.artifactPaneWidth = DEFAULT_ARTIFACT_PANE_WIDTH;
  component.isArtifactPaneMaximized = false;
  open['artifactPaneWidthBeforeMaximize'] = DEFAULT_ARTIFACT_PANE_WIDTH;
  open['cdr'] = { detectChanges: vi.fn() };

  return component;
}

function switchConversation(component: ConversationChatAreaComponent): void {
  (component as unknown as { resetConversationScopedViewState(): void }).resetConversationScopedViewState();
}

describe('artifact pane maximize state across conversation switches', () => {
  it('resets width to the default when leaving a maximized pane on conversation switch', () => {
    const component = createComponent();

    component.toggleMaximizeArtifactPane();
    expect(component.isArtifactPaneMaximized).toBe(true);
    expect(component.artifactPaneWidth).toBe(100);

    switchConversation(component);

    expect(component.isArtifactPaneMaximized).toBe(false);
    expect(component.artifactPaneWidth).toBe(DEFAULT_ARTIFACT_PANE_WIDTH);
  });

  it('preserves a user-dragged width across conversation switches when not maximized', () => {
    const component = createComponent();
    component.artifactPaneWidth = 60;

    switchConversation(component);

    expect(component.isArtifactPaneMaximized).toBe(false);
    expect(component.artifactPaneWidth).toBe(60);
  });

  it('resets both flag and width when closing the artifact panel while maximized', () => {
    const component = createComponent();
    component.toggleMaximizeArtifactPane();

    component.onCloseArtifactPanel();

    expect(component.isArtifactPaneMaximized).toBe(false);
    expect(component.artifactPaneWidth).toBe(DEFAULT_ARTIFACT_PANE_WIDTH);
  });
});
