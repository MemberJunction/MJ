/**
 * Context tokens and property defaults.
 *
 * A property (a User View property, a dashboard property, a query's server-set variable) can
 * default to a fixed value or to a context token: a name from a closed list, worked out from the
 * context user and the clock alone. The same resolver runs in the browser and on the server, so
 * the two can differ only in the time zone they are given.
 *
 * - User tokens (`Context.UserID`, `Context.UserEmail`, `Context.UserName`) need a context user;
 *   without one they throw rather than resolve to a blank.
 * - Date tokens give a `YYYY-MM-DD` date in the given zone (`Context.Today`, `Context.StartOf*`),
 *   or an ISO 8601 instant (`Context.Now`). Only date tokens take an offset.
 * - The zone is an IANA name, `'UTC'` when none is given. Weeks start on Monday (ISO 8601) unless
 *   the context says Sunday.
 */

import { IsValidUUID } from '@memberjunction/global';

/** Every context token. The list is closed: an app's own context is a property value, never a token. */
export const CONTEXT_TOKENS = [
    'Context.UserID',
    'Context.UserEmail',
    'Context.UserName',
    'Context.Now',
    'Context.Today',
    'Context.StartOfWeek',
    'Context.StartOfMonth',
    'Context.StartOfQuarter',
    'Context.StartOfYear',
] as const;

/** A context token: one of {@link CONTEXT_TOKENS}. */
export type ContextToken = typeof CONTEXT_TOKENS[number];

/** The value types a property can declare. */
export const PROPERTY_VALUE_TYPES = ['string', 'number', 'boolean', 'date', 'uuid'] as const;

/** A property's value type: one of {@link PROPERTY_VALUE_TYPES}. */
export type PropertyValueType = typeof PROPERTY_VALUE_TYPES[number];

/** The units an offset can move a date token by. */
export const PROPERTY_OFFSET_UNITS = ['day', 'week', 'month', 'quarter', 'year'] as const;

/** An offset unit: one of {@link PROPERTY_OFFSET_UNITS}. */
export type PropertyOffsetUnit = typeof PROPERTY_OFFSET_UNITS[number];

/** Moves a date token: `{ Amount: -30, Unit: 'day' }` is thirty days earlier. */
export interface PropertyDefaultOffset {
    /** A whole number; negative moves back. */
    Amount: number;
    Unit: PropertyOffsetUnit;
}

/** A property value, fixed or resolved. */
export type PropertyValue = string | number | boolean | null;

/**
 * A property's default: a fixed value, or a token worked out when the value is used. Set exactly
 * one of `Value` and `Token`. This is the shape the `MJ: User Views.Properties` JSON stores.
 */
export interface PropertyDefault {
    /** A fixed value. Set this or Token, not both. */
    Value?: PropertyValue;
    /** A context token. Set this or Value, not both. */
    Token?: ContextToken;
    /** Moves a date token; refused on a user token and on a fixed value. */
    Offset?: PropertyDefaultOffset;
}

/** The comparison a User View property's value drives. */
export type UserViewPropertyOperator = '=' | '<>' | 'IN' | '>' | '>=' | '<' | '<=';

/** The field a User View property filters, and how. */
export interface UserViewPropertyTarget {
    /** A field of the view's entity. */
    Field: string;
    Operator: UserViewPropertyOperator;
}

/**
 * One declared property of a User View: a named, typed input that adds one predicate on its
 * target field when a run gives it a value or it has a default. Stored as a JSON array in the
 * `Properties` column of `MJ: User Views`.
 */
export interface UserViewProperty {
    /** Unique within the view. */
    Name: string;
    /** The value's type. A value of another type is refused. */
    Type: PropertyValueType;
    /** Shown to whoever sets the property. */
    Description?: string;
    /** Used when a run gives no value: a fixed value or a context token. */
    Default?: PropertyDefault;
    /** True: a run with no value and no default is refused. */
    IsRequired?: boolean;
    /** False: only server code may set it, and a client value is refused. Default true. */
    AllowOverride?: boolean;
    /** The predicate the value drives. */
    Target: UserViewPropertyTarget;
}

/** What a token is worked out from. */
export interface PropertyResolutionContext {
    /** The context user. Required by the user tokens. `UserInfo` fits. */
    User?: { ID: string; Email?: string; Name?: string };
    /** The clock. Defaults to the current time. */
    Now?: Date;
    /** IANA time zone the date tokens are worked out in. Defaults to `'UTC'`. */
    TimeZone?: string;
    /** First day of the week for `Context.StartOfWeek`: 1 = Monday (default, ISO 8601), 0 = Sunday. */
    WeekStartsOn?: 0 | 1;
}

/**
 * The request header that carries the caller's IANA time zone. `GraphQLDataProvider` sends it;
 * MJServer reads it into `UserPayload.TimeZone`.
 */
export const TIME_ZONE_HEADER = 'x-mj-timezone';

/** Longer than any IANA name; a longer header value is refused without asking `Intl`. */
const MAX_TIME_ZONE_LENGTH = 64;

const USER_TOKENS: readonly ContextToken[] = ['Context.UserID', 'Context.UserEmail', 'Context.UserName'];

/** The property types each token's value can fill. */
const TOKEN_VALUE_TYPES: Record<ContextToken, readonly PropertyValueType[]> = {
    'Context.UserID': ['uuid', 'string'],
    'Context.UserEmail': ['string'],
    'Context.UserName': ['string'],
    'Context.Now': ['date', 'string'],
    'Context.Today': ['date', 'string'],
    'Context.StartOfWeek': ['date', 'string'],
    'Context.StartOfMonth': ['date', 'string'],
    'Context.StartOfQuarter': ['date', 'string'],
    'Context.StartOfYear': ['date', 'string'],
};

/** `YYYY-MM-DD`, optionally followed by an ISO 8601 time and zone. */
const ISO_DATE_VALUE = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/** A calendar date. */
interface CalendarDate {
    year: number;
    month: number;
    day: number;
}

/** A calendar date and wall-clock time in some zone. */
interface WallClock extends CalendarDate {
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
}

/** True when `name` is a time zone this runtime's `Intl` accepts (an IANA name such as `'Europe/Paris'`). */
export function IsValidTimeZone(name: string | null | undefined): boolean {
    if (typeof name !== 'string' || name.length === 0 || name.length > MAX_TIME_ZONE_LENGTH) {
        return false;
    }
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: name });
        return true;
    } catch {
        return false;
    }
}

/** This runtime's own IANA time zone, or undefined where `Intl` gives none. */
export function GetLocalTimeZone(): string | undefined {
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return IsValidTimeZone(zone) ? zone : undefined;
    } catch {
        return undefined;
    }
}

/** True when `token` is one of {@link CONTEXT_TOKENS}. */
export function IsContextToken(token: string | null | undefined): token is ContextToken {
    return typeof token === 'string' && (CONTEXT_TOKENS as readonly string[]).includes(token);
}

/**
 * Works out a property default: the fixed value, or the token resolved by {@link ResolveContextToken}.
 * @throws when the default is malformed (see {@link ValidatePropertyDefault}) or the token cannot be resolved
 */
export function ResolvePropertyDefault(def: PropertyDefault, ctx: PropertyResolutionContext): PropertyValue {
    const errors = shapeErrors(def);
    if (errors.length > 0) {
        throw new Error(`Invalid property default: ${errors.join(' ')}`);
    }
    return def.Token !== undefined ? ResolveContextToken(def.Token, def.Offset, ctx) : (def.Value ?? null);
}

/**
 * Works out one context token.
 * @returns the user's ID, email or name; a `YYYY-MM-DD` date in the context's zone; or, for
 *   `Context.Now`, an ISO 8601 instant
 * @throws on an unknown token, a bad offset, an offset on a user token, a user token with no
 *   context user, or an invalid time zone
 */
export function ResolveContextToken(token: ContextToken, offset: PropertyDefaultOffset | undefined, ctx: PropertyResolutionContext): string {
    const errors = tokenErrors(token, offset);
    if (errors.length > 0) {
        throw new Error(errors.join(' '));
    }
    if (USER_TOKENS.includes(token)) {
        return resolveUserToken(token, ctx);
    }
    const timeZone = ctx.TimeZone ?? 'UTC';
    if (!IsValidTimeZone(timeZone)) {
        throw new Error(`Invalid time zone "${timeZone}".`);
    }
    const now = ctx.Now ?? new Date();
    if (isNaN(now.getTime())) {
        throw new Error('The context clock (Now) is not a valid date.');
    }
    const local = wallClockIn(now, timeZone);
    if (token === 'Context.Now') {
        return offset ? wallClockToInstant({ ...local, ...addOffset(local, offset) }, timeZone).toISOString() : now.toISOString();
    }
    const start = startOfToken(token, local, ctx.WeekStartsOn === 0 ? 0 : 1);
    return formatCalendarDate(offset ? addOffset(start, offset) : start);
}

/**
 * Checks a property default against the property's type, as when the definition is saved.
 * @returns the problems found; empty when the default is valid
 */
export function ValidatePropertyDefault(def: PropertyDefault, type: PropertyValueType): string[] {
    if (!(PROPERTY_VALUE_TYPES as readonly string[]).includes(type)) {
        return [`Unknown property type "${type}". Allowed: ${PROPERTY_VALUE_TYPES.join(', ')}.`];
    }
    const errors = shapeErrors(def);
    if (errors.length > 0) {
        return errors;
    }
    if (def.Token !== undefined) {
        return TOKEN_VALUE_TYPES[def.Token].includes(type) ? [] : [`${def.Token} cannot default a ${type} property.`];
    }
    return isValueOfType(def.Value ?? null, type) ? [] : [`Value ${JSON.stringify(def.Value)} is not a valid ${type}.`];
}

/** Problems with a default's shape that need no property type: Value vs Token, the token, the offset. */
function shapeErrors(def: PropertyDefault): string[] {
    if (def === null || typeof def !== 'object' || Array.isArray(def)) {
        return ['A default must be an object with Value or Token.'];
    }
    const hasValue = def.Value !== undefined;
    const hasToken = def.Token !== undefined;
    if (hasValue && hasToken) {
        return ['Set Value or Token, not both.'];
    }
    if (!hasValue && !hasToken) {
        return ['Set Value or Token.'];
    }
    if (hasValue) {
        return def.Offset !== undefined ? ['Offset applies only to a token.'] : [];
    }
    return tokenErrors(def.Token, def.Offset);
}

/** Problems with a token and its offset. */
function tokenErrors(token: string | undefined, offset: PropertyDefaultOffset | undefined): string[] {
    if (!IsContextToken(token)) {
        return [`Unknown token "${token}". Allowed: ${CONTEXT_TOKENS.join(', ')}.`];
    }
    if (offset === undefined) {
        return [];
    }
    if (USER_TOKENS.includes(token)) {
        return [`${token} cannot take an offset; offsets apply to date tokens only.`];
    }
    if (offset === null || typeof offset !== 'object') {
        return ['Offset must be an object with Amount and Unit.'];
    }
    const errors: string[] = [];
    if (!(PROPERTY_OFFSET_UNITS as readonly string[]).includes(offset.Unit)) {
        errors.push(`Unknown offset unit "${offset.Unit}". Allowed: ${PROPERTY_OFFSET_UNITS.join(', ')}.`);
    }
    if (!Number.isInteger(offset.Amount)) {
        errors.push(`Offset Amount must be a whole number; got ${JSON.stringify(offset.Amount)}.`);
    }
    return errors;
}

function resolveUserToken(token: ContextToken, ctx: PropertyResolutionContext): string {
    const user = ctx.User;
    if (!user?.ID) {
        throw new Error(`${token} needs a context user, and none was given.`);
    }
    const value = token === 'Context.UserID' ? user.ID : token === 'Context.UserEmail' ? user.Email : user.Name;
    if (!value) {
        throw new Error(`${token}: the context user has no value for it.`);
    }
    return value;
}

/** True when a fixed value fits the property type. Null fits every type. */
function isValueOfType(value: PropertyValue, type: PropertyValueType): boolean {
    if (value === null) {
        return true;
    }
    switch (type) {
        case 'string':
            return typeof value === 'string';
        case 'number':
            return typeof value === 'number' && Number.isFinite(value);
        case 'boolean':
            return typeof value === 'boolean';
        case 'uuid':
            return typeof value === 'string' && IsValidUUID(value);
        case 'date':
            return typeof value === 'string' && isValidDateValue(value);
        default:
            return false;
    }
}

/** An ISO 8601 date or date-time whose date part is a real calendar day (no 30 February). */
function isValidDateValue(value: string): boolean {
    const match = ISO_DATE_VALUE.exec(value);
    if (!match || isNaN(Date.parse(value))) {
        return false;
    }
    const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    return date.month >= 1 && date.month <= 12 && date.day >= 1 && date.day <= daysInMonth(date.year, date.month);
}

/** The first day of the period a date token names, from today's date in the zone. */
function startOfToken(token: ContextToken, today: CalendarDate, weekStartsOn: 0 | 1): CalendarDate {
    switch (token) {
        case 'Context.StartOfWeek': {
            const dayOfWeek = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
            return addDays(today, -((dayOfWeek - weekStartsOn + 7) % 7));
        }
        case 'Context.StartOfMonth':
            return { year: today.year, month: today.month, day: 1 };
        case 'Context.StartOfQuarter':
            return { year: today.year, month: Math.floor((today.month - 1) / 3) * 3 + 1, day: 1 };
        case 'Context.StartOfYear':
            return { year: today.year, month: 1, day: 1 };
        default:
            return { year: today.year, month: today.month, day: today.day };
    }
}

/** Moves a date by an offset. Month-based units land on the target month's last day when it is shorter. */
function addOffset(date: CalendarDate, offset: PropertyDefaultOffset): CalendarDate {
    switch (offset.Unit) {
        case 'day':
            return addDays(date, offset.Amount);
        case 'week':
            return addDays(date, offset.Amount * 7);
        case 'month':
            return addMonths(date, offset.Amount);
        case 'quarter':
            return addMonths(date, offset.Amount * 3);
        case 'year':
            return addMonths(date, offset.Amount * 12);
        default:
            throw new Error(`Unknown offset unit "${offset.Unit}".`);
    }
}

function addDays(date: CalendarDate, days: number): CalendarDate {
    const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
    return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

function addMonths(date: CalendarDate, months: number): CalendarDate {
    const index = date.year * 12 + (date.month - 1) + months;
    const year = Math.floor(index / 12);
    const month = index - year * 12 + 1;
    return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatCalendarDate(date: CalendarDate): string {
    const pad = (n: number, width: number): string => String(n).padStart(width, '0');
    return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

/** The calendar date and wall-clock time of an instant in a zone. */
function wallClockIn(instant: Date, timeZone: string): WallClock {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
    }).formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value);
    return {
        year: part('year'),
        month: part('month'),
        day: part('day'),
        hour: part('hour') % 24, // some engines write midnight as 24 even with h23
        minute: part('minute'),
        second: part('second'),
        millisecond: instant.getUTCMilliseconds(),
    };
}

/** The instant a wall-clock time in a zone names. Two passes settle the zone offset across a DST change. */
function wallClockToInstant(local: WallClock, timeZone: string): Date {
    const asUTC = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond);
    const firstGuess = asUTC - zoneOffsetMs(asUTC, timeZone);
    return new Date(asUTC - zoneOffsetMs(firstGuess, timeZone));
}

/** How far the zone's wall clock is ahead of UTC at an instant, in milliseconds. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
    const local = wallClockIn(new Date(instantMs), timeZone);
    return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond) - instantMs;
}
