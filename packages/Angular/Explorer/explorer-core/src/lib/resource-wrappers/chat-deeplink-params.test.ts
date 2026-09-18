import { describe, expect, it } from 'vitest';
import { resolveDeepLinkParam } from './chat-deeplink-params.js';

describe('resolveDeepLinkParam', () => {
  const SAVED = { conversationId: 'PREVIOUS-VISIT' };

  it('prefers the live URL over the restored tab configuration', () => {
    // The regression: a deep link opened in a fresh tab restored the PREVIOUS visit's
    // queryParams and nothing reconciled them with the URL, so the link opened the wrong
    // conversation. Every Slack/Teams "open conversation" click is this cold-load path.
    expect(
      resolveDeepLinkParam('conversationId', '?conversationId=FROM-LINK', SAVED, 'FROM-CONFIG')
    ).toBe('FROM-LINK');
  });

  it('falls back to restored queryParams when the URL has none', () => {
    expect(resolveDeepLinkParam('conversationId', '', SAVED, 'FROM-CONFIG')).toBe('PREVIOUS-VISIT');
  });

  it('falls back to the tab configuration when neither URL nor saved params have it', () => {
    expect(resolveDeepLinkParam('conversationId', '?other=1', undefined, 'FROM-CONFIG')).toBe('FROM-CONFIG');
  });

  it('returns undefined when nothing supplies the parameter', () => {
    expect(resolveDeepLinkParam('conversationId', '', undefined, undefined)).toBeUndefined();
  });

  it('ignores an empty URL value rather than treating it as a selection', () => {
    expect(resolveDeepLinkParam('conversationId', '?conversationId=', SAVED, undefined)).toBe('PREVIOUS-VISIT');
  });

  it('handles a leading-? and a bare search string alike', () => {
    expect(resolveDeepLinkParam('artifactId', '?artifactId=A1', undefined, undefined)).toBe('A1');
    expect(resolveDeepLinkParam('artifactId', 'artifactId=A2', undefined, undefined)).toBe('A2');
  });
});
