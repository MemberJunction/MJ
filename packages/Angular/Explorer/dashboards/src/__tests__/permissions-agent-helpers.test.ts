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
import { ParseAuditFilterParams } from '../Permissions/permissions-shared';

describe('parseAuditFilterParams', () => {
    it('returns all-empty filters for an empty params object', () => {
        const r = ParseAuditFilterParams({});
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value).toEqual({ DomainName: '', ChangedByUserID: '', StartDate: '', EndDate: '' });
        }
    });

    it('returns all-empty filters for null/undefined params', () => {
        expect(ParseAuditFilterParams(null).ok).toBe(true);
        expect(ParseAuditFilterParams(undefined).ok).toBe(true);
    });

    it('maps userId to ChangedByUserID and trims string fields', () => {
        const r = ParseAuditFilterParams({ domainName: '  Dashboard Permissions  ', userId: ' u-1 ' });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.DomainName).toBe('Dashboard Permissions');
            expect(r.value.ChangedByUserID).toBe('u-1');
        }
    });

    it('accepts a valid YYYY-MM-DD date range', () => {
        const r = ParseAuditFilterParams({ startDate: '2026-01-01', endDate: '2026-06-30' });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.StartDate).toBe('2026-01-01');
            expect(r.value.EndDate).toBe('2026-06-30');
        }
    });

    it('rejects an unparseable startDate', () => {
        const r = ParseAuditFilterParams({ startDate: 'not-a-date' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('startDate');
    });

    it('rejects an unparseable endDate', () => {
        const r = ParseAuditFilterParams({ endDate: 'garbage' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('endDate');
    });

    it('rejects a range where startDate is after endDate', () => {
        const r = ParseAuditFilterParams({ startDate: '2026-07-01', endDate: '2026-01-01' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('on or before');
    });

    it('allows startDate equal to endDate', () => {
        const r = ParseAuditFilterParams({ startDate: '2026-03-15', endDate: '2026-03-15' });
        expect(r.ok).toBe(true);
    });

    it('ignores non-string fields, collapsing them to empty filters', () => {
        const r = ParseAuditFilterParams({ domainName: 42, userId: { id: 'x' }, startDate: null });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value).toEqual({ DomainName: '', ChangedByUserID: '', StartDate: '', EndDate: '' });
        }
    });
});
