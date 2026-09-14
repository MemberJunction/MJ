/**
 * Parsing DuckDuckGo result HTML.
 *
 * Moved here from `CoreActions/__tests__/web-search-parse.test.ts` when the `Web Search` action
 * became a provider-neutral router and the DuckDuckGo scraping moved into this driver. The
 * defect it pins is unchanged, and so is the reason it must keep being pinned.
 *
 * **The defect these pin.** The result block was captured with `<div class="...result...">(.*?)</div>`
 * — non-greedy, so it stopped at the first NESTED `</div>`. A result block contains nested divs, and
 * the link sits near the top of one while the snippet sits after that inner div. So the link and
 * title were captured and every snippet was cut out of the captured text.
 *
 * The result was ten well-formed hits with `snippet: ''` throughout: search results that look
 * completely normal and carry no information. A caller cannot tell that apart from a topic nobody
 * has written about — a Content Pipeline draft said "the research data was empty", which was
 * literally true of what it was handed, and a reviewer counting sources overruled it.
 *
 * The parse now slices from one result's start to the next, capturing the whole block including
 * nesting, without trying to balance tags with a regular expression.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn(), UserInfo: class {} }));
vi.mock('@memberjunction/global', () => ({ RegisterClass: () => (t: unknown) => t, MJGlobal: { Instance: { ClassFactory: {} } } }));
vi.mock('@memberjunction/network-utils', () => ({ HttpGet: vi.fn(), IsHttpError: () => false }));

import { DuckDuckGoWebSearchProvider } from '../providers/DuckDuckGoWebSearchProvider';

/**
 * Reaches the private parser; it is the unit under test and has no public seam.
 *
 * Normalised to the lowercase shape these assertions were written against, so the guard keeps
 * testing the parse rather than the rename it survived when it moved into this package.
 */
function parse(html: string, maxResults = 10): Array<{ title: string; url: string; snippet: string }> {
    const provider = new DuckDuckGoWebSearchProvider() as unknown as {
        parseResultsHtml(html: string, maxResults: number): Array<{ Title: string; URL: string; Snippet: string }>;
    };
    return provider
        .parseResultsHtml(html, maxResults)
        .map((h) => ({ title: h.Title, url: h.URL, snippet: h.Snippet }));
}

/**
 * One result in the shape DuckDuckGo actually emits: the anchor wrapped in its own div, so the
 * snippet lives AFTER an inner `</div>`. That nesting is the entire bug.
 */
function resultBlock(title: string, url: string, snippet: string): string {
    return `
      <div class="result results_links">
        <div class="result__body">
          <h2 class="result__title">
            <a rel="nofollow" href="${url}" class="result__a">${title}</a>
          </h2>
          <a class="result__snippet" href="${url}">${snippet}</a>
          <span class="result__url">example.com</span>
        </div>
      </div>`;
}

describe('parseSearchResults', () => {
    it('captures the snippet, which sits AFTER a nested closing div', () => {
        const [first] = parse(resultBlock('A DAG explained', 'https://example.com/dag', 'A directed acyclic graph has no cycles.'));

        expect(first.title).toBe('A DAG explained');
        expect(first.url).toBe('https://example.com/dag');
        // The assertion that would have caught this on day one.
        expect(first.snippet).toBe('A directed acyclic graph has no cycles.');
    });

    it('keeps each result’s snippet with its OWN result', () => {
        // Slicing between starts must not let one block bleed into the next — that would attach
        // the wrong text to a source, which is worse than no text at all.
        const html =
            resultBlock('First', 'https://example.com/1', 'Snippet one.') +
            resultBlock('Second', 'https://example.com/2', 'Snippet two.');
        const results = parse(html);

        expect(results).toHaveLength(2);
        expect(results[0].snippet).toBe('Snippet one.');
        expect(results[1].snippet).toBe('Snippet two.');
    });

    it('honours maxResults', () => {
        const html = [1, 2, 3, 4, 5]
            .map((n) => resultBlock(`T${n}`, `https://example.com/${n}`, `S${n}`))
            .join('');
        expect(parse(html, 3)).toHaveLength(3);
    });

    it('still returns a result whose snippet genuinely is absent', () => {
        // An empty snippet is a legitimate outcome for some results; only ALL of them being empty
        // indicates the markup moved. The parser must not drop the hit.
        const html = `
          <div class="result results_links">
            <div class="result__body">
              <h2 class="result__title"><a href="https://example.com/x" class="result__a">Title only</a></h2>
            </div>
          </div>`;
        const [only] = parse(html);

        expect(only.title).toBe('Title only');
        expect(only.snippet).toBe('');
    });

    it('returns nothing for markup with no results, rather than throwing', () => {
        expect(parse('<html><body><p>no results here</p></body></html>')).toEqual([]);
    });
});
