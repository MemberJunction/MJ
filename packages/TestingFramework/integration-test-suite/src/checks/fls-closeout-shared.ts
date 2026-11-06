/**
 * fls-closeout-shared.ts — helpers shared by the field-level security close-out bundles
 * (`fls-closeout`, `fls-closeout-pending`, `fls-closeout-client`).
 *
 * The close-out bundles reuse the seeded FLS principals and the fixture the `fls-enforcement`
 * and `fls-enforcement-client` lifecycles provision; what lives here is what those bundles add
 * on top: the extra rule tightenings, the value markers the checks search for, and the
 * assertions that a refusal uses one shared wording whichever key or column it names.
 */
import { RunView } from '@memberjunction/core';
import type { BaseEntity, RunViewParams, UserInfo } from '@memberjunction/core';
import { Assert } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, FlsFixture } from '@memberjunction/testing-integration';
import {
    SEEDED_FLS_ENTITY, FLS_DENY_READ_FIELD, FLS_UPDATE_DENY_FIELD, FLS_READER_DENIED_FIELD
} from '@memberjunction/testing-integration';
import { Q, SchemaOf, FlsEntity, FieldOf, SetRule } from './fls-enforcement.checks';

/** A column name no MJ entity has: the "unknown" half of every denied-versus-unknown comparison. */
export const UNKNOWN_FIELD = 'ZzNoSuchFieldCloseout';

/** The placeholder a refusal's key is replaced with, so two refusals can be compared as templates. */
const KEY_PLACEHOLDER = '<key>';

/** The stored values of the fixture employee's denied columns, which no restricted reader may ever receive. */
export interface CloseoutMarkers {
    /** The fixture row's `Email`, which the reader is denied. */
    Email: string;
    /** The fixture row's `Title`, which the multi user is denied (through the Denier role). */
    Title: string;
}

/**
 * The tightenings the close-out server bundles apply on top of the shared fixture, all on
 * non-system roles through the real entity path:
 * - Reader.Email → Deny: the reader's read-denied column.
 * - Denier.Title → Deny: the multi user's read-denied column, on an identity that can also create and update.
 * - Denier.Phone → Allow/Deny/Deny: readable but not writable for the multi user.
 * Returns an error message, or null when every tightening saved.
 */
export async function ApplyCloseoutTightenings(ctx: IntegrationCheckContext, fx: FlsFixture): Promise<string | null> {
    const entity = FlsEntity(ctx);
    const roles = fx.RoleIDs!;
    const edits: Array<[string, string, 'Allow' | 'Deny' | 'No Access', 'Allow' | 'Deny' | 'No Access', 'Allow' | 'Deny' | 'No Access']> = [
        [FLS_READER_DENIED_FIELD, roles.Reader, 'Deny', 'No Access', 'No Access'],
        [FLS_DENY_READ_FIELD, roles.Denier, 'Deny', 'No Access', 'No Access'],
        [FLS_UPDATE_DENY_FIELD, roles.Denier, 'Allow', 'Deny', 'Deny'],
    ];
    for (const [fieldName, roleId, read, update, create] of edits) {
        const [ok, message] = await SetRule(ctx, FieldOf(entity, fieldName).ID, roleId, read, update, create);
        if (!ok) {
            return `tightening ${fieldName} for role ${roleId} was refused: ${message}`;
        }
    }
    await ctx.Provider.Refresh();
    return null;
}

/** Reads the fixture employee's denied values from the database (fixture SQL, server transport). */
export async function ReadCloseoutMarkers(ctx: IntegrationCheckContext, employeeID: string): Promise<CloseoutMarkers> {
    const rows = await Q<{ Email: string; Title: string }>(ctx,
        `SELECT Email, Title FROM [${SchemaOf(ctx)}].Employee WHERE ID = '${employeeID}'`);
    Assert(rows.length === 1 && !!rows[0].Email && !!rows[0].Title, 'the fixture employee must carry an Email and a Title');
    return { Email: rows[0].Email, Title: rows[0].Title };
}

/** Always-true, column-agnostic, unique-per-tag predicate, so a read lands on a cold cache slot. */
export function ColdFilter(tag: string): string {
    return `'${tag}' <> 'zzz-cache-test-marker'`;
}

/** The error text of anything a call threw. */
export function ErrorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/**
 * Runs a RunView that field-level security must REFUSE, and returns the refusal's text. Depending
 * on the path the refusal is thrown or reported as `{ Success: false }`; throws if the view ran.
 */
export async function RunViewRefusal(params: RunViewParams, user: UserInfo, what: string): Promise<string> {
    let succeeded = false;
    let message = '';
    try {
        const result = await new RunView().RunView(params, user);
        succeeded = result.Success;
        message = result.ErrorMessage ?? '';
    } catch (e) {
        message = ErrorText(e);
    }
    Assert(!succeeded, `${what}: the request must be refused before it runs, but it ran`);
    return message;
}

/**
 * The text of a refusal with its key replaced by a placeholder, so a refusal naming a denied field
 * and one naming an unknown field can be compared for equality. The key is matched quoted, as
 * every field-security message quotes it.
 */
export function RefusalTemplate(message: string, key: string): string {
    return message.split(`'${key}'`).join(`'${KEY_PLACEHOLDER}'`);
}

/**
 * Asserts `message` contains the wording `template` produces for SOME key: the text a refusal
 * gives when the key it names is not known in advance (a look-alike spelling is reported as written).
 */
export function AssertMatchesKeyedWording(
    message: string, template: (key: string, entityName: string) => string, entityName: string, what: string
): void {
    const [prefix, suffix] = template(KEY_PLACEHOLDER, entityName).split(KEY_PLACEHOLDER);
    const start = message.indexOf(prefix);
    const matches = start >= 0 && message.indexOf(suffix, start + prefix.length) > start;
    Assert(matches, `${what}: expected the wording "${template(KEY_PLACEHOLDER, entityName)}", got '${message}'`);
}

/**
 * Asserts the refusal for a denied key and the refusal for an unknown key are the same text apart
 * from the key itself, and that each is exactly the expected wording.
 */
export function AssertDeniedEqualsUnknown(
    deniedMessage: string, deniedKey: string, unknownMessage: string, unknownKey: string,
    expected: (key: string, entityName: string) => string, entityName: string, what: string
): void {
    Assert(deniedMessage.includes(expected(deniedKey, entityName)),
        `${what}: the denied key's refusal must read "${expected(deniedKey, entityName)}", got '${deniedMessage}'`);
    Assert(unknownMessage.includes(expected(unknownKey, entityName)),
        `${what}: the unknown key's refusal must read "${expected(unknownKey, entityName)}" (the same wording as a denied key), got '${unknownMessage}'`);
    Assert(RefusalTemplate(deniedMessage, deniedKey) === RefusalTemplate(unknownMessage, unknownKey),
        `${what}: a denied key and an unknown key must be refused with the SAME text, or the refusal reveals which columns exist ` +
        `(denied: '${deniedMessage}', unknown: '${unknownMessage}')`);
}

/** Asserts no serialization of `values` carries `marker`, and that `key` is absent. */
export function AssertValuesWithheld(values: Record<string, unknown> | null | undefined, key: string, marker: string, what: string): void {
    Assert(values != null, `${what}: no values to inspect`);
    Assert(!(key in values!), `${what}: the denied key '${key}' is present`);
    Assert(!JSON.stringify(values).includes(marker), `${what}: the denied value of '${key}' is present under some key`);
}

/** Asserts `values` carries `key` with exactly `marker`: the unrestricted control that a check is not vacuous. */
export function AssertValuePresent(values: Record<string, unknown> | null | undefined, key: string, marker: string, what: string): void {
    Assert(values != null, `${what}: no values to inspect`);
    Assert(values![key] === marker, `${what}: '${key}' must carry its stored value '${marker}' (got '${String(values![key])}')`);
}

/**
 * Asserts an entity object holds no value of `fieldName`, by every route a value could leave it:
 * `GetAll()`, `To()`, `GetDataObject()`, `GetDataObjectJSON()` and the field's own `Value`, and that
 * the field is marked not loaded.
 */
export async function AssertEntityObjectWithholds(entity: BaseEntity, fieldName: string, marker: string, what: string): Promise<void> {
    AssertValuesWithheld(entity.GetAll() as Record<string, unknown>, fieldName, marker, `${what} GetAll()`);
    AssertValuesWithheld(entity.To() as Record<string, unknown>, fieldName, marker, `${what} To()`);
    AssertValuesWithheld(await entity.GetDataObject() as Record<string, unknown>, fieldName, marker, `${what} GetDataObject()`);
    const json = await entity.GetDataObjectJSON();
    Assert(!json.includes(marker), `${what} GetDataObjectJSON(): the denied value of '${fieldName}' is present`);
    const field = entity.Fields.find(f => f.Name.toLowerCase() === fieldName.toLowerCase());
    Assert(field != null, `${what}: field '${fieldName}' not found on the object`);
    Assert(field!.NotLoaded, `${what}: '${fieldName}' must be marked not loaded`);
    Assert(field!.Value == null, `${what}: '${fieldName}'.Value must hold no value (got '${String(field!.Value)}')`);
}

/** The entity this family of bundles secures. */
export const CLOSEOUT_ENTITY = SEEDED_FLS_ENTITY;
