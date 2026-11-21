import { describe, it, expect } from 'vitest';
import { CalendarTargetError, CalendarWallClock } from '../Calendar';

describe('CalendarTargetError', () => {
    it('accepts a target that names whose calendar', () => {
        expect(CalendarTargetError('CreateEvent', { Identifier: 'rep@example.com' })).toBeNull();
        expect(CalendarTargetError('CreateEvent', { Identifier: 'rep@example.com', CalendarID: 'team' })).toBeNull();
    });

    /** The whole point: no target means no default mailbox, so the call is refused before any I/O. */
    it.each([
        ['missing', undefined],
        ['null', null],
        ['blank', { Identifier: '   ' }],
    ])('refuses a %s target, naming the operation', (_label, target) => {
        const message = CalendarTargetError('CancelEvent', target);
        expect(message).toContain('CancelEvent needs a Target');
        expect(message).toContain('never fall back to a default account');
    });
});

describe('CalendarWallClock', () => {
    it('renders UTC as the instant itself', () => {
        expect(CalendarWallClock(new Date('2026-03-08T14:05:09Z'), 'UTC')).toBe('2026-03-08T14:05:09');
    });

    it('renders the wall clock of a named zone, across a DST change', () => {
        // New York: EST (-5) before 8 March 2026, EDT (-4) after.
        expect(CalendarWallClock(new Date('2026-03-07T15:00:00Z'), 'America/New_York')).toBe('2026-03-07T10:00:00');
        expect(CalendarWallClock(new Date('2026-03-09T15:00:00Z'), 'America/New_York')).toBe('2026-03-09T11:00:00');
    });

    it('gives the calendar day in the zone, which can differ from the UTC day', () => {
        expect(CalendarWallClock(new Date('2026-03-08T02:00:00Z'), 'America/Los_Angeles').slice(0, 10)).toBe('2026-03-07');
    });

    it('renders midnight as 00, not 24', () => {
        expect(CalendarWallClock(new Date('2026-03-08T00:00:00Z'), 'UTC')).toBe('2026-03-08T00:00:00');
    });

    it('throws for a zone the runtime does not know', () => {
        expect(() => CalendarWallClock(new Date(), 'Not/AZone')).toThrow(RangeError);
    });
});
