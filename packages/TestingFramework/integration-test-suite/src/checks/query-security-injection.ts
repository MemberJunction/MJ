/**
 * query-security-injection.ts — QS6 and QS7 of the 'query-security' bundle: hostile values passed
 * to SHIPPED queries (`metadata/queries`), by name, as any caller would.
 *
 * QS6 (string values) answers with an oracle: fixture rows whose stored text IS the hostile value.
 * A tag is stored for each value (`MJ: Tags.DisplayName`, and one tagged item whose `RecordID` is
 * itself hostile), and rated conversation messages whose feedback holds `%` and `_`. A value that
 * is escaped correctly finds exactly its own row; one that breaks out of its literal either errors
 * or finds other rows. QS7 (typed and server-set values) expects a validation refusal before any
 * SQL runs. After every probe the canary must be untouched.
 *
 * Fixture rows are written with fixture SQL under fixed IDs, removed first and again in teardown.
 */
import type { DatabasePlatform } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { ForPlatform, RunFixtureSQL, RunFixtureSQLQuietly } from './query-extraction-fixture';
import { CanaryChange, FailOnFindings, RequireSecurityFixture, RunSavedByName, SECURITY_BUNDLE } from './query-security-fixture';
import type { QueryOutcome } from './query-security-fixture';

/** Values that try to leave the literal they are written into, or to be read as SQL or as a template. */
const HOSTILE_VALUES: readonly string[] = [
    "' OR 1=1 --",
    "'; DROP TABLE mjit_security.Canary; --",
    "O\\'Brien",
    'trailing backslash \\',
    'O’Brien ‘quoted’',
    'ʼ OR 1=1 --',
    "' + (SELECT TOP 1 Name FROM __mj.vwUsers) + '",
    '100%',
    'a_b',
    '{{ 7 * 7 }}',
    '{% if true %}x{% endif %}',
    '{# a comment #}',
    'plain',
];

/** A value, stored as both a tag's display name and (for the record probe) a tagged item's RecordID. */
const RECORD_ID_PROBE = "r' OR '1'='1";

function fixedID(kind: string, index: number): string {
    return `C142${kind}000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

const TAG_ID = (i: number) => fixedID('A', i);
const ITEM_ID = (i: number) => fixedID('B', i);
const CONVERSATION_ID = fixedID('C', 1);
const DETAIL_ID = (i: number) => fixedID('D', i);
const RECORD_OF = (i: number) => (i === 0 ? RECORD_ID_PROBE : `zzz-it142-r${i}`);

/** Rated messages for the LIKE probe: [feedback, the search value that must find it alone]. */
const FEEDBACK: ReadonlyArray<[string, string | null]> = [['50%off today', '0%o'], ['50Xoff today', null], ['a_b marker', 'a_b'], ['aXb marker', null]];

function literal(value: string): string {
    return `N'${value.replace(/'/g, "''")}'`;
}

function tagStatements(): string[] {
    const users = "(SELECT [ID] FROM __mj.[Entity] WHERE [Name] = 'MJ: Users')";
    return HOSTILE_VALUES.flatMap((value, i) => [
        `INSERT INTO __mj.[Tag] ([ID], [Name], [DisplayName]) VALUES ('${TAG_ID(i)}', ${literal(`zzz-it142-tag-${i}`)}, ${literal(value)})`,
        `INSERT INTO __mj.[TaggedItem] ([ID], [TagID], [EntityID], [RecordID]) VALUES ('${ITEM_ID(i)}', '${TAG_ID(i)}', ${users}, ${literal(RECORD_OF(i))})`,
    ]);
}

function feedbackStatements(userID: string): string[] {
    return [
        `INSERT INTO __mj.[Conversation] ([ID], [UserID], [Name]) VALUES ('${CONVERSATION_ID}', '${userID}', N'zzz-it142 feedback')`,
        ...FEEDBACK.map(([text], i) =>
            `INSERT INTO __mj.[ConversationDetail] ([ID], [ConversationID], [Role], [Message], [UserRating], [UserFeedback]) VALUES ('${DETAIL_ID(i)}', '${CONVERSATION_ID}', 'User', N'zzz-it142 message', 5, ${literal(text)})`),
    ];
}

function removeStatements(): string[] {
    const ids = (f: (i: number) => string, n: number) => Array.from({ length: n }, (_, i) => `'${f(i)}'`).join(', ');
    return [
        `DELETE FROM __mj.[ConversationDetail] WHERE [ID] IN (${ids(DETAIL_ID, FEEDBACK.length)})`,
        `DELETE FROM __mj.[Conversation] WHERE [ID] = '${CONVERSATION_ID}'`,
        `DELETE FROM __mj.[TaggedItem] WHERE [ID] IN (${ids(ITEM_ID, HOSTILE_VALUES.length)})`,
        `DELETE FROM __mj.[Tag] WHERE [ID] IN (${ids(TAG_ID, HOSTILE_VALUES.length)})`,
    ];
}

function forPlatform(statements: readonly string[], platform: DatabasePlatform): string[] {
    return statements.map(s => ForPlatform(s, platform));
}

/** Writes the tags, tagged items and rated messages (after removing any left from an earlier run). */
export async function SetupInjectionFixture(ctx: IntegrationCheckContext): Promise<void> {
    const platform = RequireSecurityFixture().Platform;
    await RunFixtureSQL(ctx, SECURITY_BUNDLE, forPlatform([...removeStatements(), ...tagStatements(), ...feedbackStatements(ctx.User.ID)], platform));
}

/** Removes the injection fixture rows; never throws. */
export async function TeardownInjectionFixture(ctx: IntegrationCheckContext): Promise<void> {
    await RunFixtureSQLQuietly(ctx, SECURITY_BUNDLE, forPlatform(removeStatements(), RequireSecurityFixture().Platform));
}

// ─── QS6: string values ─────────────────────────────────────────────────────

/** Records a finding unless the run succeeded with exactly `expected` (compared by `key`). */
function judgeRows(findings: string[], label: string, outcome: QueryOutcome, key: string, expected: readonly string[]): void {
    if (!outcome.Success) {
        findings.push(`${label}: failed with '${outcome.Error}', expected exactly [${expected.join(', ')}]`);
        return;
    }
    const got = outcome.Rows.map(r => String(r[key])).sort();
    if (JSON.stringify(got) !== JSON.stringify([...expected].sort())) findings.push(`${label}: returned [${got.join(', ')}], expected exactly [${expected.join(', ')}]`);
}

async function judgeCanary(ctx: IntegrationCheckContext, findings: string[], label: string): Promise<void> {
    const change = await CanaryChange(ctx);
    if (change) findings.push(`WRITE: ${label} changed the canary: ${change}`);
}

async function probeTagValues(ctx: IntegrationCheckContext, findings: string[]): Promise<number> {
    for (const [i, value] of HOSTILE_VALUES.entries()) {
        const outcome = await RunSavedByName('MJ/Tags', 'Entity Records By Tag', ctx.User, { entityName: 'MJ: Users', tagName: value });
        judgeRows(findings, `Entity Records By Tag, tagName ${JSON.stringify(value)}`, outcome, 'RecordID', [RECORD_OF(i)]);
        await judgeCanary(ctx, findings, `tagName ${JSON.stringify(value)}`);
    }
    const breakout = await RunSavedByName('MJ/Tags', 'Entity Records By Tag', ctx.User, { entityName: "MJ: Users' OR 1=1 --", tagName: 'plain' });
    judgeRows(findings, 'Entity Records By Tag, a hostile entityName', breakout, 'RecordID', []);
    return HOSTILE_VALUES.length + 1;
}

async function probeRecordValue(ctx: IntegrationCheckContext, findings: string[]): Promise<number> {
    const outcome = await RunSavedByName('MJ/Tags', 'Tags For Entity Record', ctx.User, { entityName: 'MJ: Users', recordID: RECORD_ID_PROBE });
    const ids = { ...outcome, Rows: outcome.Rows.map(r => ({ TagID: NormalizeUUID(String(r['TagID'])) })) };
    judgeRows(findings, `Tags For Entity Record, recordID ${JSON.stringify(RECORD_ID_PROBE)}`, ids, 'TagID', [NormalizeUUID(TAG_ID(0))]);
    await judgeCanary(ctx, findings, 'recordID');
    return 1;
}

/** The fixture conversation's rows of a feedback search, by their feedback text. */
async function probeLikeValues(ctx: IntegrationCheckContext, findings: string[]): Promise<number> {
    const searches: Array<[string, string[]]> = [
        ...FEEDBACK.filter(([, search]) => search !== null).map(([text, search]): [string, string[]] => [search!, [text]]),
        ['off today', ['50%off today', '50Xoff today']],
        // A `%` at either end is dropped by the filter (it adds its own), so this is a search for "50".
        ['50%', ['50%off today', '50Xoff today']],
        ["' OR 1=1 --", []],
    ];
    for (const [search, expected] of searches) {
        const outcome = await RunSavedByName('MJ/Conversations', 'ListConversationDetailFeedback', ctx.User, { SearchText: search });
        const own = { ...outcome, Rows: outcome.Rows.filter(r => NormalizeUUID(String(r['ConversationID'])) === NormalizeUUID(CONVERSATION_ID)) };
        judgeRows(findings, `ListConversationDetailFeedback, SearchText ${JSON.stringify(search)}`, own, 'Comments', expected);
        await judgeCanary(ctx, findings, `SearchText ${JSON.stringify(search)}`);
    }
    return searches.length;
}

async function checkQs6StringValues(ctx: IntegrationCheckContext): Promise<void> {
    const findings: string[] = [];
    let exercised = await probeTagValues(ctx, findings);
    exercised += await probeRecordValue(ctx, findings);
    exercised += await probeLikeValues(ctx, findings);
    FailOnFindings('QS6', findings, exercised);
}

// ─── QS7: typed and server-set values ───────────────────────────────────────

interface TypedProbe {
    Label: string;
    Category: string;
    Query: string;
    Parameters: Record<string, unknown>;
    /** Every part the refusal must carry, the first as its start; `null` when the run must succeed (a benign control). */
    Refusal: string[] | null;
}

const VALIDATION = 'Parameter validation failed: ';

/**
 * The database's answer to a uuid column compared with a value that is not one. The value reached
 * the server as ONE literal (the PostgreSQL message quotes it whole; the SQL Server message carries
 * the statement, with the quote doubled), so the quoting held: this is a type error, not a break-out.
 */
function uuidValueRefusal(platform: DatabasePlatform): string[] {
    return platform === 'postgresql'
        ? ['invalid input syntax for type uuid: "x\' OR \'1\'=\'1"']
        : ['Error executing SQL', 'Conversion failed when converting from a character string to uniqueidentifier.', "'x'' OR ''1''=''1'"];
}

function serverSetRefusal(): string[] {
    return [VALIDATION, ...['PrimaryKeyJoin', 'SchemaName', 'BaseView'].map(n => `Parameter '${n}' is set by the server; a caller value for it is refused`)];
}

function typedProbes(platform: DatabasePlatform): TypedProbe[] {
    return [
        { Label: 'a date with SQL after it', Category: 'MJ/AI', Query: 'AIUsageDaily', Parameters: { start: "2024-01-01'; DROP TABLE mjit_security.Canary; --" },
            Refusal: [`${VALIDATION}Parameter 'start' must be a valid date`] },
        { Label: 'a date (control)', Category: 'MJ/AI', Query: 'AIUsageDaily', Parameters: { start: '2024-01-01', end: '2024-01-02' }, Refusal: null },
        { Label: 'a number with SQL after it (sqlNumber)', Category: 'MJ/AI/Agents', Query: 'GetAgentRunTree', Parameters: { agentRunID: fixedID('E', 1), maxDepth: '1; DROP TABLE mjit_security.Canary' },
            Refusal: [`${VALIDATION}Parameter 'maxDepth' must be a number`] },
        { Label: 'a number with SQL after it (declared number, no filter)', Category: 'MJ/Conversations', Query: 'ListConversationDetailFeedback', Parameters: { MinRating: '1 OR 1=1' },
            Refusal: [`${VALIDATION}Parameter 'MinRating' must be a number`] },
        { Label: 'an array holding a quote', Category: 'MJ/AI/Agents', Query: 'GetArtifactVersionsByID', Parameters: { versionIds: [fixedID('E', 2), "x' OR '1'='1"] }, Refusal: uuidValueRefusal(platform) },
        { Label: 'an array (control)', Category: 'MJ/AI/Agents', Query: 'GetArtifactVersionsByID', Parameters: { versionIds: [fixedID('E', 2)] }, Refusal: null },
        { Label: 'a server-set parameter from the caller', Category: 'MJ', Query: 'ExternalChangeDetection_DetectCreations',
            Parameters: { PrimaryKeyJoin: '1=1) OR (1=1', SchemaName: '__mj', BaseView: 'vwUsers' }, Refusal: serverSetRefusal() },
    ];
}

/** Records a finding unless the outcome is what the probe expects. */
function judgeTyped(findings: string[], probe: TypedProbe, outcome: QueryOutcome): void {
    if (probe.Refusal === null) {
        if (!outcome.Success) findings.push(`${probe.Label}: the control must run: ${outcome.Error}`);
        return;
    }
    const single = probe.Refusal.length === 1;
    const matches = !outcome.Success && outcome.Error.startsWith(probe.Refusal[0]) && probe.Refusal.every(part => outcome.Error.includes(part))
        && (!single || outcome.Error === probe.Refusal[0]);
    if (!matches) {
        findings.push(`${probe.Label}: ${outcome.Success ? `ran (${outcome.Rows.length} rows)` : `refused with '${outcome.Error.slice(0, 600)}'`}, expected a refusal carrying ${JSON.stringify(probe.Refusal)}`);
    }
}

async function checkQs7TypedValues(ctx: IntegrationCheckContext): Promise<void> {
    const probes = typedProbes(RequireSecurityFixture().Platform);
    const findings: string[] = [];
    for (const probe of probes) {
        judgeTyped(findings, probe, await RunSavedByName(probe.Category, probe.Query, ctx.User, probe.Parameters));
        await judgeCanary(ctx, findings, probe.Label);
    }
    FailOnFindings('QS7', findings, probes.length);
}

export const InjectionChecks: NamedCheck[] = [
    { Id: `${SECURITY_BUNDLE}.QS6`, Name: 'QS6: hostile string values passed to shipped queries find exactly their own stored rows (quotes, backslashes, unicode quotes, LIKE wildcards, template tags)', Fn: checkQs6StringValues },
    { Id: `${SECURITY_BUNDLE}.QS7`, Name: 'QS7: a date, number or array value carrying SQL, and a caller value for a server-set parameter, are refused before any SQL runs', Fn: checkQs7TypedValues },
];
