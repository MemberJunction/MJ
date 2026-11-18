import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    CONTEXT_TOKENS,
    ContextToken,
    GetLocalTimeZone,
    IsContextToken,
    IsValidTimeZone,
    PropertyDefault,
    PropertyDefaultOffset,
    PropertyResolutionContext,
    ResolveContextToken,
    ResolvePropertyDefault,
    ValidatePropertyDefault,
} from '../generic/contextTokens';

const USER = { ID: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', Email: 'ada@example.com', Name: 'Ada Lovelace' };

/** Wednesday 14 October 2026, mid-afternoon UTC. */
const WEDNESDAY = new Date('2026-10-14T15:30:00.000Z');

function ctx(now: Date = WEDNESDAY, overrides: Partial<PropertyResolutionContext> = {}): PropertyResolutionContext {
    return { User: USER, Now: now, ...overrides };
}

function resolve(token: ContextToken, offset?: PropertyDefaultOffset, context: PropertyResolutionContext = ctx()): string {
    return ResolveContextToken(token, offset, context);
}

describe('CONTEXT_TOKENS', () => {
    it('is the closed list of nine tokens', () => {
        expect(CONTEXT_TOKENS).toEqual([
            'Context.UserID', 'Context.UserEmail', 'Context.UserName',
            'Context.Now', 'Context.Today',
            'Context.StartOfWeek', 'Context.StartOfMonth', 'Context.StartOfQuarter', 'Context.StartOfYear',
        ]);
    });

    it('IsContextToken accepts only listed names, case and all', () => {
        expect(IsContextToken('Context.Today')).toBe(true);
        expect(IsContextToken('context.today')).toBe(false);
        expect(IsContextToken('Context.Chapter')).toBe(false);
        expect(IsContextToken(undefined)).toBe(false);
    });
});

describe('ResolveContextToken: user tokens', () => {
    it('gives the user ID, email and name', () => {
        expect(resolve('Context.UserID')).toBe(USER.ID);
        expect(resolve('Context.UserEmail')).toBe(USER.Email);
        expect(resolve('Context.UserName')).toBe(USER.Name);
    });

    it('throws, never blanks, when the context has no user', () => {
        expect(() => resolve('Context.UserID', undefined, { Now: WEDNESDAY })).toThrow(/needs a context user/);
        expect(() => resolve('Context.UserEmail', undefined, { Now: WEDNESDAY })).toThrow(/needs a context user/);
    });

    it('throws when the user lacks the field the token reads', () => {
        expect(() => resolve('Context.UserEmail', undefined, ctx(WEDNESDAY, { User: { ID: USER.ID } }))).toThrow(/has no value/);
    });

    it('refuses an offset on a user token', () => {
        expect(() => resolve('Context.UserID', { Amount: 1, Unit: 'day' })).toThrow(/cannot take an offset/);
    });

    it('needs no user for a date token', () => {
        expect(resolve('Context.Today', undefined, { Now: WEDNESDAY })).toBe('2026-10-14');
    });
});

describe('ResolveContextToken: date tokens in UTC', () => {
    it('Now is the context clock as an ISO instant', () => {
        expect(resolve('Context.Now')).toBe('2026-10-14T15:30:00.000Z');
    });

    it('Today and the StartOf tokens are YYYY-MM-DD dates', () => {
        expect(resolve('Context.Today')).toBe('2026-10-14');
        expect(resolve('Context.StartOfWeek')).toBe('2026-10-12');
        expect(resolve('Context.StartOfMonth')).toBe('2026-10-01');
        expect(resolve('Context.StartOfQuarter')).toBe('2026-10-01');
        expect(resolve('Context.StartOfYear')).toBe('2026-01-01');
    });

    it('StartOfQuarter maps each month to its quarter', () => {
        const starts = ['01', '01', '01', '04', '04', '04', '07', '07', '07', '10', '10', '10'];
        starts.forEach((start, i) => {
            const month = String(i + 1).padStart(2, '0');
            expect(resolve('Context.StartOfQuarter', undefined, ctx(new Date(`2026-${month}-15T12:00:00Z`)))).toBe(`2026-${start}-01`);
        });
    });

    it('defaults the clock to the current time', () => {
        vi.useFakeTimers();
        vi.setSystemTime(WEDNESDAY);
        try {
            expect(ResolveContextToken('Context.Today', undefined, { User: USER })).toBe('2026-10-14');
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('ResolveContextToken: week start', () => {
    const sunday = new Date('2026-10-18T10:00:00Z');

    it('starts weeks on Monday by default (ISO 8601)', () => {
        expect(resolve('Context.StartOfWeek', undefined, ctx(WEDNESDAY))).toBe('2026-10-12');
        expect(resolve('Context.StartOfWeek', undefined, ctx(sunday))).toBe('2026-10-12');
    });

    it('starts weeks on Sunday when asked', () => {
        expect(resolve('Context.StartOfWeek', undefined, ctx(WEDNESDAY, { WeekStartsOn: 0 }))).toBe('2026-10-11');
        expect(resolve('Context.StartOfWeek', undefined, ctx(sunday, { WeekStartsOn: 0 }))).toBe('2026-10-18');
    });

    it('a Monday is its own week start', () => {
        expect(resolve('Context.StartOfWeek', undefined, ctx(new Date('2026-10-12T00:00:00Z')))).toBe('2026-10-12');
    });
});

describe('ResolveContextToken: offsets', () => {
    it.each<[PropertyDefaultOffset, string]>([
        [{ Amount: -30, Unit: 'day' }, '2026-09-14'],
        [{ Amount: 1, Unit: 'day' }, '2026-10-15'],
        [{ Amount: -2, Unit: 'week' }, '2026-09-30'],
        [{ Amount: -1, Unit: 'month' }, '2026-09-14'],
        [{ Amount: 3, Unit: 'month' }, '2027-01-14'],
        [{ Amount: -1, Unit: 'quarter' }, '2026-07-14'],
        [{ Amount: -1, Unit: 'year' }, '2025-10-14'],
        [{ Amount: 0, Unit: 'month' }, '2026-10-14'],
    ])('Today %o is %s', (offset, expected) => {
        expect(resolve('Context.Today', offset)).toBe(expected);
    });

    it('moves a StartOf token: the start of last month, last week, next year', () => {
        expect(resolve('Context.StartOfMonth', { Amount: -1, Unit: 'month' })).toBe('2026-09-01');
        expect(resolve('Context.StartOfWeek', { Amount: -1, Unit: 'week' })).toBe('2026-10-05');
        expect(resolve('Context.StartOfYear', { Amount: 1, Unit: 'year' })).toBe('2027-01-01');
        expect(resolve('Context.StartOfQuarter', { Amount: -1, Unit: 'quarter' })).toBe('2026-07-01');
    });

    it('31 March minus a month lands on the last day of February, leap year or not', () => {
        expect(resolve('Context.Today', { Amount: -1, Unit: 'month' }, ctx(new Date('2025-03-31T12:00:00Z')))).toBe('2025-02-28');
        expect(resolve('Context.Today', { Amount: -1, Unit: 'month' }, ctx(new Date('2024-03-31T12:00:00Z')))).toBe('2024-02-29');
    });

    it('29 February plus a year and 31 May minus a quarter clamp to the month end', () => {
        expect(resolve('Context.Today', { Amount: 1, Unit: 'year' }, ctx(new Date('2024-02-29T12:00:00Z')))).toBe('2025-02-28');
        expect(resolve('Context.Today', { Amount: -1, Unit: 'quarter' }, ctx(new Date('2026-05-31T12:00:00Z')))).toBe('2026-02-28');
    });

    it('moves Now by the offset and keeps the wall-clock time', () => {
        expect(resolve('Context.Now', { Amount: -1, Unit: 'day' })).toBe('2026-10-13T15:30:00.000Z');
        expect(resolve('Context.Now', { Amount: -1, Unit: 'month' })).toBe('2026-09-14T15:30:00.000Z');
    });

    it('moves Now in the zone, so a day across a DST change is 23 hours', () => {
        // 08:00 EDT on 8 March 2026 (DST began at 02:00 that morning); a day earlier is 08:00 EST.
        const now = new Date('2026-03-08T12:00:00Z');
        expect(resolve('Context.Now', { Amount: -1, Unit: 'day' }, ctx(now, { TimeZone: 'America/New_York' }))).toBe('2026-03-07T13:00:00.000Z');
    });

    it('refuses a bad unit or a fractional amount', () => {
        expect(() => resolve('Context.Today', { Amount: 1, Unit: 'fortnight' } as unknown as PropertyDefaultOffset)).toThrow(/Unknown offset unit "fortnight"/);
        expect(() => resolve('Context.Today', { Amount: 1.5, Unit: 'day' })).toThrow(/whole number/);
    });
});

describe('ResolveContextToken: time zones', () => {
    // 23:30 UTC on 31 March: already 1 April in Auckland (UTC+13), still 31 March in Los Angeles.
    const nearMidnight = new Date('2026-03-31T23:30:00Z');

    it('works dates out in the given zone, where UTC and local dates differ near midnight', () => {
        expect(resolve('Context.Today', undefined, ctx(nearMidnight))).toBe('2026-03-31');
        expect(resolve('Context.Today', undefined, ctx(nearMidnight, { TimeZone: 'Pacific/Auckland' }))).toBe('2026-04-01');
        expect(resolve('Context.Today', undefined, ctx(new Date('2026-04-01T03:00:00Z'), { TimeZone: 'America/Los_Angeles' }))).toBe('2026-03-31');
    });

    it('a zone that crosses a month and quarter boundary moves the StartOf tokens with it', () => {
        expect(resolve('Context.StartOfMonth', undefined, ctx(nearMidnight))).toBe('2026-03-01');
        expect(resolve('Context.StartOfMonth', undefined, ctx(nearMidnight, { TimeZone: 'Pacific/Auckland' }))).toBe('2026-04-01');
        expect(resolve('Context.StartOfQuarter', undefined, ctx(nearMidnight))).toBe('2026-01-01');
        expect(resolve('Context.StartOfQuarter', undefined, ctx(nearMidnight, { TimeZone: 'Pacific/Auckland' }))).toBe('2026-04-01');
    });

    it('Now is the same instant in every zone', () => {
        expect(resolve('Context.Now', undefined, ctx(nearMidnight, { TimeZone: 'Pacific/Auckland' }))).toBe('2026-03-31T23:30:00.000Z');
    });

    it('throws on an invalid zone instead of falling back to UTC', () => {
        expect(() => resolve('Context.Today', undefined, ctx(WEDNESDAY, { TimeZone: 'Mars/Olympus_Mons' }))).toThrow(/Invalid time zone/);
    });

    it('throws on an invalid clock', () => {
        expect(() => resolve('Context.Today', undefined, ctx(new Date('not a date')))).toThrow(/not a valid date/);
    });
});

describe('ResolvePropertyDefault', () => {
    it('returns a fixed value as is, null included', () => {
        expect(ResolvePropertyDefault({ Value: 'X' }, ctx())).toBe('X');
        expect(ResolvePropertyDefault({ Value: 0 }, ctx())).toBe(0);
        expect(ResolvePropertyDefault({ Value: false }, ctx())).toBe(false);
        expect(ResolvePropertyDefault({ Value: null }, ctx())).toBeNull();
    });

    it('resolves a token with its offset', () => {
        expect(ResolvePropertyDefault({ Token: 'Context.Today', Offset: { Amount: -30, Unit: 'day' } }, ctx())).toBe('2026-09-14');
        expect(ResolvePropertyDefault({ Token: 'Context.UserID' }, ctx())).toBe(USER.ID);
    });

    it('throws on a malformed default rather than guessing', () => {
        expect(() => ResolvePropertyDefault({ Value: 'X', Token: 'Context.Today' }, ctx())).toThrow(/not both/);
        expect(() => ResolvePropertyDefault({}, ctx())).toThrow(/Set Value or Token/);
        expect(() => ResolvePropertyDefault({ Token: 'Context.Chapter' } as unknown as PropertyDefault, ctx())).toThrow(/Unknown token/);
    });
});

describe('ValidatePropertyDefault', () => {
    it('accepts well-formed defaults', () => {
        expect(ValidatePropertyDefault({ Value: 'abc' }, 'string')).toEqual([]);
        expect(ValidatePropertyDefault({ Value: 42.5 }, 'number')).toEqual([]);
        expect(ValidatePropertyDefault({ Value: true }, 'boolean')).toEqual([]);
        expect(ValidatePropertyDefault({ Value: '2024-02-29' }, 'date')).toEqual([]);
        expect(ValidatePropertyDefault({ Value: '2026-10-14T15:30:00Z' }, 'date')).toEqual([]);
        expect(ValidatePropertyDefault({ Value: USER.ID }, 'uuid')).toEqual([]);
        expect(ValidatePropertyDefault({ Value: null }, 'uuid')).toEqual([]);
        expect(ValidatePropertyDefault({ Token: 'Context.UserID' }, 'uuid')).toEqual([]);
        expect(ValidatePropertyDefault({ Token: 'Context.StartOfMonth', Offset: { Amount: -1, Unit: 'month' } }, 'date')).toEqual([]);
    });

    it('refuses an unknown token', () => {
        expect(ValidatePropertyDefault({ Token: 'Context.Chapter' } as unknown as PropertyDefault, 'string')[0]).toMatch(/Unknown token "Context.Chapter"/);
    });

    it('refuses an unknown unit and a fractional amount', () => {
        const badUnit = { Token: 'Context.Today', Offset: { Amount: 1, Unit: 'decade' } } as unknown as PropertyDefault;
        expect(ValidatePropertyDefault(badUnit, 'date')[0]).toMatch(/Unknown offset unit "decade"/);
        expect(ValidatePropertyDefault({ Token: 'Context.Today', Offset: { Amount: 0.5, Unit: 'day' } }, 'date')[0]).toMatch(/whole number/);
    });

    it('refuses an offset on a user token or on a fixed value', () => {
        expect(ValidatePropertyDefault({ Token: 'Context.UserEmail', Offset: { Amount: 1, Unit: 'day' } }, 'string')[0]).toMatch(/cannot take an offset/);
        expect(ValidatePropertyDefault({ Value: '2026-01-01', Offset: { Amount: 1, Unit: 'day' } }, 'date')[0]).toMatch(/only to a token/);
    });

    it('refuses neither or both of Value and Token', () => {
        expect(ValidatePropertyDefault({}, 'string')).toEqual(['Set Value or Token.']);
        expect(ValidatePropertyDefault({ Value: 'x', Token: 'Context.UserName' }, 'string')).toEqual(['Set Value or Token, not both.']);
    });

    it('refuses a default that is not an object', () => {
        expect(ValidatePropertyDefault(null as unknown as PropertyDefault, 'string')[0]).toMatch(/must be an object/);
        expect(ValidatePropertyDefault('Context.Today' as unknown as PropertyDefault, 'date')[0]).toMatch(/must be an object/);
    });

    it.each<[PropertyDefault['Value'], 'string' | 'number' | 'boolean' | 'date' | 'uuid']>([
        [42, 'string'],
        ['42', 'number'],
        [Number.NaN, 'number'],
        [Number.POSITIVE_INFINITY, 'number'],
        ['true', 'boolean'],
        [1, 'boolean'],
        ['not-a-date', 'date'],
        ['2026-02-30', 'date'],
        ['2026-13-01', 'date'],
        ['14/10/2026', 'date'],
        ['1', 'date'],
        ['not-a-uuid', 'uuid'],
        [7, 'uuid'],
    ])('refuses fixed value %o for a %s property', (value, type) => {
        expect(ValidatePropertyDefault({ Value: value }, type)[0]).toMatch(new RegExp(`is not a valid ${type}`));
    });

    it("refuses a token whose value can't fill the property's type", () => {
        expect(ValidatePropertyDefault({ Token: 'Context.Today' }, 'number')[0]).toMatch(/cannot default a number property/);
        expect(ValidatePropertyDefault({ Token: 'Context.UserEmail' }, 'uuid')[0]).toMatch(/cannot default a uuid property/);
        expect(ValidatePropertyDefault({ Token: 'Context.UserID' }, 'date')[0]).toMatch(/cannot default a date property/);
    });

    it('refuses an unknown property type', () => {
        expect(ValidatePropertyDefault({ Value: 'x' }, 'text' as unknown as 'string')[0]).toMatch(/Unknown property type "text"/);
    });
});

describe('IsValidTimeZone and GetLocalTimeZone', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('accepts IANA names and UTC', () => {
        expect(IsValidTimeZone('UTC')).toBe(true);
        expect(IsValidTimeZone('Europe/Paris')).toBe(true);
        expect(IsValidTimeZone('America/Argentina/Buenos_Aires')).toBe(true);
    });

    it('refuses unknown, empty, absent and over-long names', () => {
        expect(IsValidTimeZone('Mars/Olympus_Mons')).toBe(false);
        expect(IsValidTimeZone('')).toBe(false);
        expect(IsValidTimeZone(null)).toBe(false);
        expect(IsValidTimeZone(undefined)).toBe(false);
        expect(IsValidTimeZone(`Europe/${'x'.repeat(80)}`)).toBe(false);
    });

    it('GetLocalTimeZone gives this runtime zone', () => {
        expect(IsValidTimeZone(GetLocalTimeZone())).toBe(true);
    });

    it('GetLocalTimeZone gives undefined where Intl reports no zone', () => {
        vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({} as Intl.ResolvedDateTimeFormatOptions);
        expect(GetLocalTimeZone()).toBeUndefined();
    });
});
