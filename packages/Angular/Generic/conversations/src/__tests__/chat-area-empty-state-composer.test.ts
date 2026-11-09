import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Template-source contract for the composer the chat area shows before a conversation exists: it gets
 * the host's default agent, application and app context, as the composer of an open conversation does.
 * Without the default agent the composer resolves no agent to call, so the voice button stays disabled
 * until a first message creates the conversation; without the application and app context a call started
 * there runs on the app's model preference and with the page's tools only after that first message.
 */
describe('chat-area empty-state composer contract', () => {
  const html = readFileSync(
    resolve(__dirname, '../lib/components/conversation/conversation-chat-area.component.html'),
    'utf8'
  );

  /** The attribute text of the chat area's own empty-state message input. */
  function emptyStateComposer(): string {
    const marker = '[emptyStateMode]="true"';
    const at = html.indexOf(marker);
    expect(at, 'the chat area renders an empty-state composer').toBeGreaterThan(-1);
    const start = html.lastIndexOf('<mj-message-input', at);
    const end = html.indexOf('>', at);
    return html.slice(start, end);
  }

  it('binds the default agent, so the composer can resolve the agent to call before the first message', () => {
    expect(emptyStateComposer()).toContain('[defaultAgentId]="defaultAgentId"');
  });

  it('binds the application and the app context, as the composer of an open conversation does', () => {
    const composer = emptyStateComposer();
    expect(composer).toContain('[applicationId]="applicationId"');
    expect(composer).toContain('[appContext]="appContext"');
  });
});
