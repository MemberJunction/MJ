import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { MJChatHeaderDefaultComponent } from './mj-chat-header-default.component';

/** DOM-level spec for <mj-chat-header-default> — title vs. placeholder, shared-by + artifact badges. */
describe('MJChatHeaderDefaultComponent (DOM)', () => {
  it('renders the conversation title when set', () => {
    const f = renderComponentFixture(MJChatHeaderDefaultComponent, { inputs: { ConversationTitle: 'Project X' } });
    expect(text(f, '.mj-chat-header-default__title')).toContain('Project X');
  });

  it('shows the placeholder when there is no title', () => {
    const f = renderComponentFixture(MJChatHeaderDefaultComponent);
    expect(query(f, '.mj-chat-header-default__title-placeholder')).not.toBeNull();
  });

  it('shows "shared by" only when SharedBy is set', () => {
    const without = renderComponentFixture(MJChatHeaderDefaultComponent);
    expect(query(without, '.mj-chat-header-default__shared-by')).toBeNull();

    const withShared = renderComponentFixture(MJChatHeaderDefaultComponent, { inputs: { SharedBy: 'Alex' } });
    expect(text(withShared, '.mj-chat-header-default__shared-by')).toContain('Alex');
  });

  it('shows the artifact badge only when the indicator is on and the count > 0', () => {
    const zero = renderComponentFixture(MJChatHeaderDefaultComponent, { inputs: { ArtifactCount: 0 } });
    expect(query(zero, '.mj-chat-header-default__artifact-badge')).toBeNull();

    // ShowArtifactIndicator defaults to true
    const some = renderComponentFixture(MJChatHeaderDefaultComponent, { inputs: { ArtifactCount: 3 } });
    expect(text(some, '.mj-chat-header-default__artifact-badge')).toContain('3');
  });
});
