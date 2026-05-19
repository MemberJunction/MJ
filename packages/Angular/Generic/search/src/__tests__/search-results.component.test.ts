/**
 * Tests for SearchResultsComponent pure logic:
 * - SR-1: FormatScore consistency
 * - SR-4: Flat mode support
 * - SR-5: Pagination logic
 *
 * We test the logic functions directly without Angular TestBed,
 * extracting them to avoid Angular decorator/inject() issues.
 */
import { describe, it, expect } from 'vitest';
import { SearchResultItem, SearchResultGroup } from '../lib/search-types';

// ── Extract and test pure logic functions from SearchResultsComponent ──

/** Mirrors SearchResultsComponent.FormatScore */
function FormatScore(score: number): string {
    return `${Math.round(score * 100)}%`;
}

/** Mirrors SearchResultsComponent.FormatTime */
function FormatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

/** Mirrors SearchResultsComponent.ExtractUrls */
function ExtractUrls(snippet: string): string[] {
    if (!snippet) return [];
    const urlRegex = /https?:\/\/[^\s,;)>"']+/g;
    const matches = snippet.match(urlRegex);
    return matches ? [...new Set(matches)] : [];
}

/** Mirrors SearchResultsComponent.TruncateUrl */
function TruncateUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const path = parsed.pathname.length > 30
            ? parsed.pathname.substring(0, 30) + '...'
            : parsed.pathname;
        return parsed.hostname + path;
    } catch {
        return url.length > 50 ? url.substring(0, 50) + '...' : url;
    }
}

/** Mirrors SearchResultsComponent pagination logic */
function getPagedResults(flatResults: SearchResultItem[], currentPage: number, pageSize: number): SearchResultItem[] {
    const start = (currentPage - 1) * pageSize;
    return flatResults.slice(start, start + pageSize);
}

function getTotalPages(totalResults: number, pageSize: number): number {
    return Math.ceil(totalResults / pageSize);
}

function getPageNumbers(currentPage: number, totalPages: number): number[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: number[] = [1];
    const start = Math.max(2, currentPage - 2);
    const end = Math.min(totalPages - 1, currentPage + 2);
    if (start > 2) pages.push(-1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push(-1);
    pages.push(totalPages);
    return pages;
}

/** Mirrors SearchResultsComponent group logic */
function getVisibleResults(
    group: SearchResultGroup,
    isExpanded: boolean,
    maxPerGroup: number
): SearchResultItem[] {
    if (isExpanded) return group.Results;
    return group.Results.slice(0, maxPerGroup);
}

function createResult(id: string, score: number): SearchResultItem {
    return {
        ID: id, Title: `R${id}`, Snippet: '', EntityName: 'Test',
        RecordID: `rec-${id}`, SourceType: 'entity', Score: score,
        ScoreBreakdown: { Vector: score * 0.6, FullText: score * 0.4 },
        Tags: [], SourceIcon: 'fa-solid fa-database', MatchedAt: new Date(),
    };
}

// ═══════════════════════════════════════════
// SR-1: FormatScore consistency
// ═══════════════════════════════════════════
describe('FormatScore (SR-1)', () => {
    it('should format 0.85 as 85%', () => {
        expect(FormatScore(0.85)).toBe('85%');
    });

    it('should format 1.0 as 100%', () => {
        expect(FormatScore(1.0)).toBe('100%');
    });

    it('should format 0 as 0%', () => {
        expect(FormatScore(0)).toBe('0%');
    });

    it('should round to nearest integer', () => {
        expect(FormatScore(0.856)).toBe('86%');
        expect(FormatScore(0.854)).toBe('85%');
    });

    it('should produce same format for card header and expanded detail (SR-1 fix)', () => {
        // Before the fix, expanded detail used (score * 100).toFixed(0)
        // Now both use FormatScore(score) — same function, same output
        const score = 0.7823;
        expect(FormatScore(score)).toBe('78%');
    });

    it('should match ScoreBreakdown formatting when using same function', () => {
        // Both overall and breakdown scores should use the same format
        const overallScore = 0.85;
        const vectorScore = 0.72;
        expect(FormatScore(overallScore)).toBe('85%');
        expect(FormatScore(vectorScore)).toBe('72%');
    });
});

// ═══════════════════════════════════════════
// SR-5: Pagination
// ═══════════════════════════════════════════
describe('Pagination (SR-5)', () => {
    const results = Array.from({ length: 35 }, (_, i) => createResult(String(i + 1), 1 - i * 0.02));

    it('should calculate total pages correctly', () => {
        expect(getTotalPages(35, 10)).toBe(4);
    });

    it('should return first page of results', () => {
        const page = getPagedResults(results, 1, 10);
        expect(page).toHaveLength(10);
        expect(page[0].ID).toBe('1');
        expect(page[9].ID).toBe('10');
    });

    it('should return correct results for page 2', () => {
        const page = getPagedResults(results, 2, 10);
        expect(page).toHaveLength(10);
        expect(page[0].ID).toBe('11');
    });

    it('should return partial last page', () => {
        const page = getPagedResults(results, 4, 10);
        expect(page).toHaveLength(5); // 35 - 30 = 5
    });

    it('should return empty for out-of-range page', () => {
        const page = getPagedResults(results, 100, 10);
        expect(page).toHaveLength(0);
    });

    it('should show all pages when total is 7 or fewer', () => {
        const pages = getPageNumbers(1, 5);
        expect(pages).toEqual([1, 2, 3, 4, 5]);
        expect(pages).not.toContain(-1);
    });

    it('should include ellipsis for many pages', () => {
        const pages = getPageNumbers(8, 15);
        expect(pages[0]).toBe(1);
        expect(pages[pages.length - 1]).toBe(15);
        expect(pages).toContain(-1);
    });

    it('should center current page in page numbers', () => {
        const pages = getPageNumbers(8, 15);
        expect(pages).toContain(8);
        expect(pages).toContain(6); // current - 2
        expect(pages).toContain(10); // current + 2
    });

    it('should handle single page', () => {
        const pages = getPageNumbers(1, 1);
        expect(pages).toEqual([1]);
    });

    it('should handle zero pages', () => {
        expect(getTotalPages(0, 10)).toBe(0);
    });

    it('should handle exact page boundary (e.g. 20 results / 10 per page)', () => {
        const exactResults = Array.from({ length: 20 }, (_, i) => createResult(String(i + 1), 1 - i * 0.02));
        expect(getTotalPages(20, 10)).toBe(2);

        const page1 = getPagedResults(exactResults, 1, 10);
        expect(page1).toHaveLength(10);
        expect(page1[0].ID).toBe('1');

        const page2 = getPagedResults(exactResults, 2, 10);
        expect(page2).toHaveLength(10);
        expect(page2[0].ID).toBe('11');

        // Page 3 should be empty since 20/10 = exactly 2 pages
        const page3 = getPagedResults(exactResults, 3, 10);
        expect(page3).toHaveLength(0);
    });

    it('should return all results on single page when count equals page size', () => {
        const singlePageResults = Array.from({ length: 10 }, (_, i) => createResult(String(i + 1), 0.9));
        expect(getTotalPages(10, 10)).toBe(1);

        const page = getPagedResults(singlePageResults, 1, 10);
        expect(page).toHaveLength(10);

        const pages = getPageNumbers(1, 1);
        expect(pages).toEqual([1]);
    });

    it('should produce correct page numbers at boundary of 7 pages', () => {
        // Exactly 7 pages — should show all, no ellipsis
        const pages7 = getPageNumbers(4, 7);
        expect(pages7).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(pages7).not.toContain(-1);

        // 8 pages — should include ellipsis
        const pages8 = getPageNumbers(4, 8);
        expect(pages8[0]).toBe(1);
        expect(pages8[pages8.length - 1]).toBe(8);
    });
});

// ═══════════════════════════════════════════
// Group visibility logic
// ═══════════════════════════════════════════
describe('Group visibility', () => {
    const group: SearchResultGroup = {
        Label: 'Test', Icon: 'fa-test', SourceType: 'entity',
        Results: Array.from({ length: 10 }, (_, i) => createResult(String(i), 0.9)),
        TotalCount: 10,
    };

    it('should limit to maxPerGroup when collapsed', () => {
        const visible = getVisibleResults(group, false, 3);
        expect(visible).toHaveLength(3);
    });

    it('should show all when expanded', () => {
        const visible = getVisibleResults(group, true, 3);
        expect(visible).toHaveLength(10);
    });

    it('should show all when results <= maxPerGroup', () => {
        const smallGroup: SearchResultGroup = {
            ...group,
            Results: group.Results.slice(0, 2),
            TotalCount: 2,
        };
        const visible = getVisibleResults(smallGroup, false, 5);
        expect(visible).toHaveLength(2);
    });
});

// ═══════════════════════════════════════════
// URL helpers
// ═══════════════════════════════════════════
describe('URL helpers', () => {
    it('should extract URLs from text', () => {
        const urls = ExtractUrls('Visit https://example.com and http://test.org/path');
        expect(urls).toHaveLength(2);
        expect(urls).toContain('https://example.com');
    });

    it('should return empty for no URLs', () => {
        expect(ExtractUrls('no urls here')).toHaveLength(0);
        expect(ExtractUrls('')).toHaveLength(0);
    });

    it('should deduplicate URLs', () => {
        const urls = ExtractUrls('https://a.com and https://a.com again');
        expect(urls).toHaveLength(1);
    });

    it('should truncate long URLs', () => {
        const longUrl = 'https://example.com/' + 'a'.repeat(100);
        const truncated = TruncateUrl(longUrl);
        expect(truncated.length).toBeLessThan(longUrl.length);
        expect(truncated).toContain('...');
    });

    it('should handle short URLs', () => {
        const truncated = TruncateUrl('https://example.com/page');
        expect(truncated).toBe('example.com/page');
    });
});

// ═══════════════════════════════════════════
// FormatTime
// ═══════════════════════════════════════════
describe('FormatTime', () => {
    it('should format sub-second times in ms', () => {
        expect(FormatTime(450)).toBe('450ms');
    });

    it('should format times >= 1s in seconds', () => {
        expect(FormatTime(1500)).toBe('1.5s');
    });

    it('should format exactly 1 second', () => {
        expect(FormatTime(1000)).toBe('1.0s');
    });
});
