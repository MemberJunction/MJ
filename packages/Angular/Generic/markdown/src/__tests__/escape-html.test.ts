import { describe, it, expect } from 'vitest';
import { escapeHtmlAsText } from '../lib/utils/escape-html';

describe('escapeHtmlAsText', () => {
  it('escapes every HTML-significant character, every occurrence', () => {
    expect(escapeHtmlAsText('<a href="x" title=\'y\'>&</a><b>')).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;&lt;b&gt;',
    );
  });

  it('leaves plain text alone', () => {
    expect(escapeHtmlAsText('plain text 123')).toBe('plain text 123');
  });
});
