/**
 * Tests for the pure helper backing the Permissions Audit Log resource component's
 * `RunAuditTimelineQuery` AI-agent client tool. The component itself is a thin,
 * NavigationService-wired wrapper; the testable logic is the read-only filter
 * parsing/validation extracted into `parseAuditFilterParams` in `permissions-shared.ts`.
 *
 * 🚨 SAFETY: every tool backed by this helper is READ-ONLY — the helper only
 * validates filter input for a view-only timeline query and performs no mutation.
 */
import { describe, it, expect } from 'vitest';
import { parseAuditFilterParams } from '../Permissions/permissions-shared';

describe('parseAuditFilterParams', () => {
    it('returns all-empty filters for an empty params object', () => {
        const r = parseAuditFilterParams({});
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value).toEqual({ DomainName: '', ChangedByUserID: '', StartDate: '', EndDate: '' });
        }
    });

    it('returns all-empty filters for null/undefined params', () => {
        expect(parseAuditFilterParams(null).ok).toBe(true);
        expect(parseAuditFilterParams(undefined).ok).toBe(true);
    });

    it('maps userId to ChangedByUserID and trims string fields', () => {
        const r = parseAuditFilterParams({ domainName: '  Dashboard Permissions  ', userId: ' u-1 ' });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.DomainName).toBe('Dashboard Permissions');
            expect(r.value.ChangedByUserID).toBe('u-1');
        }
    });

    it('accepts a valid YYYY-MM-DD date range', () => {
        const r = parseAuditFilterParams({ startDate: '2026-01-01', endDate: '2026-06-30' });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.StartDate).toBe('2026-01-01');
            expect(r.value.EndDate).toBe('2026-06-30');
        }
    });

    it('rejects an unparseable startDate', () => {
        const r = parseAuditFilterParams({ startDate: 'not-a-date' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('startDate');
    });

    it('rejects an unparseable endDate', () => {
        const r = parseAuditFilterParams({ endDate: 'garbage' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('endDate');
    });

    it('rejects a range where startDate is after endDate', () => {
        const r = parseAuditFilterParams({ startDate: '2026-07-01', endDate: '2026-01-01' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('on or before');
    });

    it('allows startDate equal to endDate', () => {
        const r = parseAuditFilterParams({ startDate: '2026-03-15', endDate: '2026-03-15' });
        expect(r.ok).toBe(true);
    });

    it('ignores non-string fields, collapsing them to empty filters', () => {
        const r = parseAuditFilterParams({ domainName: 42, userId: { id: 'x' }, startDate: null });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value).toEqual({ DomainName: '', ChangedByUserID: '', StartDate: '', EndDate: '' });
        }
    });
});
