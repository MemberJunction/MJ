/**
 * A settled address must not be re-asked.
 *
 * `ProcessMapping` skipped only on `Status === 'success'`, so a row marked permanently
 * not-geocodable — an address that genuinely has no location, like "Conference Room B" — fell
 * through to a full re-attempt on every pass: mark pending (a write), geocode (nothing to find),
 * mark failed (another write). Per record. Forever. For an answer already on file.
 *
 * `UpdateNotGeocodable`'s own comment describes the intended behaviour exactly — *"Mark as
 * not_geocodable so the retry job skips it. If the user later edits the address, the hash will
 * change and SyncIfChanged will re-attempt."* The hash IS the re-attempt condition; it simply was
 * not being honoured for that outcome.
 *
 * The distinction is carried in `RetryCount`, because `GeocodeStatus` has no "not geocodable"
 * member — a settled failure is `failed` with the sentinel, a transient one is `failed` with a
 * real count, and only the second is worth retrying.
 */
import { describe, it, expect } from 'vitest';
import { IsSettledGeoCode, PERMANENT_SKIP_RETRY_COUNT } from '../types';

describe('IsSettledGeoCode', () => {
    it('treats a successful geocode as settled', () => {
        expect(IsSettledGeoCode('success', 0)).toBe(true);
    });

    it('treats a permanently not-geocodable address as settled', () => {
        // The case that was being re-attempted forever.
        expect(IsSettledGeoCode('failed', PERMANENT_SKIP_RETRY_COUNT)).toBe(true);
    });

    it('does NOT treat a transient failure as settled — retrying it is the point', () => {
        expect(IsSettledGeoCode('failed', 0)).toBe(false);
        expect(IsSettledGeoCode('failed', 1)).toBe(false);
        expect(IsSettledGeoCode('failed', PERMANENT_SKIP_RETRY_COUNT - 1)).toBe(false);
    });

    it('does not treat a pending row as settled', () => {
        // A row left pending means the previous attempt did not finish. That question is open.
        expect(IsSettledGeoCode('pending', 0)).toBe(false);
        expect(IsSettledGeoCode('pending', PERMANENT_SKIP_RETRY_COUNT)).toBe(false);
    });

    it('is inclusive at the sentinel, so a stored value can never sit just under it', () => {
        expect(IsSettledGeoCode('failed', PERMANENT_SKIP_RETRY_COUNT)).toBe(true);
        expect(IsSettledGeoCode('failed', PERMANENT_SKIP_RETRY_COUNT + 1)).toBe(true);
    });

    it('treats a missing RetryCount as zero rather than as settled', () => {
        // Failing OPEN here would be the wrong direction: it would silently stop retrying real
        // transient failures, which is a data-loss-shaped bug rather than a wasted-work one.
        expect(IsSettledGeoCode('failed', null)).toBe(false);
        expect(IsSettledGeoCode('failed', undefined)).toBe(false);
    });

    it('handles an absent status without claiming the row is settled', () => {
        expect(IsSettledGeoCode(null, PERMANENT_SKIP_RETRY_COUNT)).toBe(false);
        expect(IsSettledGeoCode(undefined, 0)).toBe(false);
        expect(IsSettledGeoCode('', 0)).toBe(false);
    });

    it('keeps the sentinel far above any plausible real retry count', () => {
        // The retry job filters `RetryCount < maxRetries`; the sentinel only works as a marker
        // while it is unreachable by ordinary retrying.
        expect(PERMANENT_SKIP_RETRY_COUNT).toBeGreaterThan(1000);
    });
});
