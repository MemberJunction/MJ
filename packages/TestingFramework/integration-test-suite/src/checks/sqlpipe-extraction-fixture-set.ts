/**
 * sqlpipe-extraction-fixture-set.ts — the fixture queries of the `sqlpipe-extraction-fixtures`
 * bundle and the metadata extraction must write for each, written by hand.
 *
 * SQL is bracket-quoted (converted for PostgreSQL). `{PATH}` is the fixture category's path and
 * `{PREFIX}` the bundle's name prefix, for compositions of the bundle's reusable target queries.
 *
 * A field's `Source` is `o:<schema.object>` (a column no entity backs; `SourceColumn` when the
 * output is aliased), `e:<Entity>.<Field>` (bound to that entity field), `c` (computed: no source),
 * or `?` (the server's source report for this construct is not asserted).
 */
import type { DatabasePlatform } from '@memberjunction/core';

export interface ExpectedField {
    readonly Name: string;
    /** Full type as SQL Server reports it. */
    readonly SS: string;
    /** Full type as PostgreSQL reports it. */
    readonly PG: string;
    /** Nullability on SQL Server (PostgreSQL reports none). */
    readonly Nullable: boolean;
    readonly Source: string;
    readonly SourceColumn?: string;
    /** The source on PostgreSQL, where it differs (same notation as `Source`). */
    readonly PgSource?: string;
    readonly Description?: string | null;
}

export interface ExpectedParameterRow {
    readonly Name: string;
    readonly Type: string;
    readonly IsRequired: boolean;
    readonly DefaultValue?: string | null;
    readonly Description?: string | null;
}

export interface ExpectedDependencyRow {
    /** A target's short name in the bundle's target table. */
    readonly Target: string;
    readonly Alias: string;
    readonly Mapping?: string;
}

export interface ExtractionFixture {
    readonly Id: string;
    readonly Title: string;
    readonly SQL: string | { readonly SqlServer: string; readonly PostgreSQL: string };
    readonly Platforms?: readonly DatabasePlatform[];
    readonly SkipReason?: string;
    readonly Parameters: readonly ExpectedParameterRow[];
    readonly Fields: readonly ExpectedField[];
    readonly Entities: readonly string[];
    readonly Dependencies?: readonly ExpectedDependencyRow[];
    readonly Status?: string;
    readonly Message?: string;
}

// Type pairs [SQL Server, PostgreSQL].
const INT = ['int', 'integer'] as const;
const N60 = ['nvarchar(60)', 'character varying(60)'] as const;
const N20 = ['nvarchar(20)', 'character varying(20)'] as const;
const DEC = ['decimal(18,4)', 'numeric(18,4)'] as const;
const DTO = ['datetimeoffset(7)', 'timestamp with time zone'] as const;
const MAX = ['nvarchar(max)', 'text'] as const;
const BIT = ['bit', 'boolean'] as const;
const UID = ['uniqueidentifier', 'uuid'] as const;
const BIG = ['bigint', 'bigint'] as const;
const FLT = ['float', 'double precision'] as const;
const V10 = ['varchar(10)', 'character varying(10)'] as const;
const U100 = ['nvarchar(100)', 'character varying(100)'] as const;
const U50 = ['nvarchar(50)', 'character varying(50)'] as const;
const NCH15 = ['nchar(15)', 'character(15)'] as const;
const COUNT = ['int', 'bigint'] as const;

type Pair = readonly [string, string];

const ACCOUNT = 'o:mjit_sqlpipe.Account';
const ORDER_LINE = 'o:mjit_sqlpipe_ext.Order Line';

function f(name: string, type: Pair, nullable: boolean, source: string, extra: Partial<ExpectedField> = {}): ExpectedField {
    return { Name: name, SS: type[0], PG: type[1], Nullable: nullable, Source: source, ...extra };
}

function calc(name: string, type: Pair, nullable = true, extra: Partial<ExpectedField> = {}): ExpectedField {
    return f(name, type, nullable, 'c', extra);
}

function p(name: string, type: string, required: boolean, extra: Partial<ExpectedParameterRow> = {}): ExpectedParameterRow {
    return { Name: name, Type: type, IsRequired: required, ...extra };
}

const ACCOUNT_KEY = [f('ID', INT, false, ACCOUNT), f('Name', N60, false, ACCOUNT)];

/** Mock-schema fixtures: types, nullability, sources and computed columns. */
const MOCK_FIELDS: ExtractionFixture[] = [
    { Id: 'EF01', Title: 'every column type of the mock table', Parameters: [], Entities: [],
        SQL: 'SELECT a.[ID], a.[Name], a.[Region], a.[Score], a.[Balance], a.[OpenedAt], a.[Notes], a.[Flag], a.[ParentID], a.[Ref], a.[BigVal], a.[Ratio] FROM mjit_sqlpipe.[Account] a',
        Fields: [...ACCOUNT_KEY, f('Region', N20, true, ACCOUNT), f('Score', INT, false, ACCOUNT), f('Balance', DEC, true, ACCOUNT), f('OpenedAt', DTO, false, ACCOUNT),
            f('Notes', MAX, true, ACCOUNT), f('Flag', BIT, false, ACCOUNT), f('ParentID', INT, true, ACCOUNT), f('Ref', UID, false, ACCOUNT),
            f('BigVal', BIG, false, ACCOUNT), f('Ratio', FLT, false, ACCOUNT)] },
    { Id: 'EF02', Title: 'SELECT * over a view on a view names the outer view as the source', Parameters: [], Entities: [],
        SQL: 'SELECT * FROM mjit_sqlpipe.[vwAccountTop]',
        Fields: [f('ID', INT, false, 'o:mjit_sqlpipe.vwAccountTop'), f('Name', N60, false, 'o:mjit_sqlpipe.vwAccountTop'), f('Score', INT, false, 'o:mjit_sqlpipe.vwAccountTop')] },
    { Id: 'EF03', Title: 'aliased columns keep their source column', Parameters: [], Entities: [],
        SQL: 'SELECT a.[ID] AS [Key], a.[Name] AS [Display Name] FROM mjit_sqlpipe.[Account] a',
        Fields: [f('Key', INT, false, ACCOUNT, { SourceColumn: 'ID' }), f('Display Name', N60, false, ACCOUNT, { SourceColumn: 'Name' })] },
    { Id: 'EF04', Title: 'computed expressions: arithmetic, decimal scale, cast, a function', Parameters: [], Entities: [],
        SQL: {
            SqlServer: 'SELECT a.[ID], a.[Score] * 2 AS [Doubled], a.[Balance] * 2 AS [Twice], CAST(a.[Name] AS NVARCHAR(10)) AS [Short], UPPER(a.[Name]) AS [Up] FROM mjit_sqlpipe.[Account] a',
            PostgreSQL: 'SELECT a.[ID], a.[Score] * 2 AS [Doubled], a.[Balance] * 2 AS [Twice], CAST(a.[Name] AS VARCHAR(10)) AS [Short], UPPER(a.[Name]) AS [Up] FROM mjit_sqlpipe.[Account] a',
        },
        Fields: [f('ID', INT, false, ACCOUNT), calc('Doubled', INT), calc('Twice', ['decimal(20,4)', 'numeric']), calc('Short', ['nvarchar(10)', 'character varying(10)']),
            calc('Up', ['nvarchar(60)', 'text'])] },
    { Id: 'EF05', Title: 'aggregates per group', Parameters: [], Entities: [],
        SQL: 'SELECT a.[Region], COUNT(*) AS [N], SUM(a.[Score]) AS [Total], AVG(a.[Balance]) AS [AvgBalance], MIN(a.[OpenedAt]) AS [FirstOpened] FROM mjit_sqlpipe.[Account] a GROUP BY a.[Region]',
        Fields: [f('Region', N20, true, ACCOUNT), calc('N', COUNT), calc('Total', COUNT), calc('AvgBalance', ['decimal(38,6)', 'numeric']), calc('FirstOpened', DTO)] },
    { Id: 'EF06', Title: 'a LEFT JOIN makes a NOT NULL column nullable; the second schema is the source', Parameters: [], Entities: [],
        SQL: 'SELECT a.[ID], ol.[Qty] FROM mjit_sqlpipe.[Account] a LEFT JOIN mjit_sqlpipe_ext.[Order Line] ol ON ol.[AccountID] = a.[ID]',
        Fields: [f('ID', INT, false, ACCOUNT), f('Qty', INT, true, ORDER_LINE)] },
    { Id: 'EF07', Title: 'names with spaces in a table and a column', Parameters: [], Entities: [],
        SQL: 'SELECT ol.[Line No], ol.[Kind] FROM mjit_sqlpipe_ext.[Order Line] ol',
        Fields: [f('Line No', INT, false, ORDER_LINE), f('Kind', V10, false, ORDER_LINE)] },
    { Id: 'EF08', Title: 'a table-valued / set-returning function', Parameters: [], Entities: [],
        SQL: "SELECT fn.[ID], fn.[Name] FROM mjit_sqlpipe.[fnAccountsInRegion]('North') fn",
        // SQL Server expands the inline function to its table; a PostgreSQL function's result columns
        // have no source and lose their length (function results carry no type modifier).
        Fields: [f('ID', INT, false, '?', { PgSource: 'c' }), f('Name', ['nvarchar(60)', 'character varying'], false, '?', { PgSource: 'c' })] },
    { Id: 'EF09', Title: 'a CTE is transparent to the source', Parameters: [], Entities: [],
        SQL: 'WITH c AS (SELECT a.[ID], a.[Name] FROM mjit_sqlpipe.[Account] a) SELECT c.[ID], c.[Name] FROM c',
        Fields: ACCOUNT_KEY },
    { Id: 'EF10', Title: 'a recursive CTE: the depth column is computed', Parameters: [], Entities: [],
        SQL: {
            SqlServer: 'WITH t AS (SELECT a.[ID], 0 AS [Depth] FROM mjit_sqlpipe.[Account] a WHERE a.[ParentID] IS NULL UNION ALL SELECT c.[ID], t.[Depth] + 1 FROM mjit_sqlpipe.[Account] c JOIN t ON c.[ParentID] = t.[ID]) SELECT t.[ID], t.[Depth] FROM t',
            PostgreSQL: 'WITH RECURSIVE t AS (SELECT a.[ID], 0 AS [Depth] FROM mjit_sqlpipe.[Account] a WHERE a.[ParentID] IS NULL UNION ALL SELECT c.[ID], t.[Depth] + 1 FROM mjit_sqlpipe.[Account] c JOIN t ON c.[ParentID] = t.[ID]) SELECT t.[ID], t.[Depth] FROM t',
        },
        // The server reports no source for a recursive CTE's columns, so both are computed.
        Fields: [calc('ID', INT), calc('Depth', INT)] },
    { Id: 'EF11', Title: 'UNION ALL takes its names and types from the first branch', Parameters: [], Entities: [],
        SQL: 'SELECT a.[ID] FROM mjit_sqlpipe.[Account] a UNION ALL SELECT ol.[Line No] FROM mjit_sqlpipe_ext.[Order Line] ol',
        // A UNION's columns have no single source: computed, NOT NULL as both branches are.
        Fields: [calc('ID', INT, false)] },
    { Id: 'EF12', Title: 'a VALUES list joined in', Parameters: [], Entities: [],
        SQL: "SELECT a.[ID], v.[Label] FROM mjit_sqlpipe.[Account] a JOIN (VALUES (0, 'zero'), (1, 'one')) AS v ([K], [Label]) ON v.[K] = a.[Score] % 2",
        Fields: [f('ID', INT, false, ACCOUNT), calc('Label', ['varchar(4)', 'text'], false)] },
    { Id: 'EF13', Title: 'window functions', Parameters: [], Entities: [],
        SQL: 'SELECT a.[ID], ROW_NUMBER() OVER (ORDER BY a.[Score]) AS [Rn], SUM(a.[Score]) OVER (PARTITION BY a.[Region]) AS [RegionTotal] FROM mjit_sqlpipe.[Account] a',
        Fields: [f('ID', INT, false, ACCOUNT), calc('Rn', BIG), calc('RegionTotal', COUNT)] },
    { Id: 'EF14', Title: 'DISTINCT, a derived table and an EXISTS subquery', Parameters: [], Entities: [],
        SQL: 'SELECT DISTINCT d.[Region] FROM (SELECT a.[ID], a.[Region] FROM mjit_sqlpipe.[Account] a) d WHERE EXISTS (SELECT 1 FROM mjit_sqlpipe_ext.[Order Line] ol WHERE ol.[AccountID] = d.[ID])',
        Fields: [f('Region', N20, true, ACCOUNT)] },
    { Id: 'EF15', Title: 'an own row cap and ORDER BY', Parameters: [], Entities: [],
        SQL: { SqlServer: 'SELECT TOP 5 a.[ID], a.[Name] FROM mjit_sqlpipe.[Account] a ORDER BY a.[ID]', PostgreSQL: 'SELECT a.[ID], a.[Name] FROM mjit_sqlpipe.[Account] a ORDER BY a.[ID] LIMIT 5' },
        Fields: ACCOUNT_KEY },
];

/** SQL Server-only constructs. */
const SQLSERVER_ONLY = { Platforms: ['sqlserver'] as const, SkipReason: 'SQL Server syntax (no PostgreSQL equivalent in this fixture)' };

const MOCK_SQLSERVER: ExtractionFixture[] = [
    { Id: 'EF16', Title: 'TRY_CAST, which node-sql-parser cannot read', ...SQLSERVER_ONLY, Parameters: [], Entities: [],
        SQL: 'SELECT a.[ID], TRY_CAST(a.[Name] AS INT) AS [NameNum] FROM mjit_sqlpipe.[Account] a', Fields: [f('ID', INT, false, ACCOUNT), calc('NameNum', INT)] },
    { Id: 'EF17', Title: 'a FOR JSON subquery', ...SQLSERVER_ONLY, Parameters: [], Entities: [],
        SQL: 'SELECT a.[ID], (SELECT b.[Name], b.[Score] FROM mjit_sqlpipe.[Account] b WHERE b.[ID] = a.[ID] FOR JSON PATH) AS [Detail] FROM mjit_sqlpipe.[Account] a',
        Fields: [f('ID', INT, false, ACCOUNT), calc('Detail', MAX)] },
    { Id: 'EF18', Title: 'STRING_AGG … WITHIN GROUP and an OPTION hint', ...SQLSERVER_ONLY, Parameters: [], Entities: [],
        SQL: "SELECT a.[Region], STRING_AGG(a.[Name], ',') WITHIN GROUP (ORDER BY a.[Name]) AS [Names] FROM mjit_sqlpipe.[Account] a GROUP BY a.[Region] OPTION (RECOMPILE)",
        Fields: [f('Region', N20, true, ACCOUNT), calc('Names', ['nvarchar(4000)', 'text'])] },
    { Id: 'EF19', Title: 'TOP … PERCENT WITH TIES', ...SQLSERVER_ONLY, Parameters: [], Entities: [],
        SQL: 'SELECT TOP 10 PERCENT WITH TIES a.[ID], a.[Score] FROM mjit_sqlpipe.[Account] a ORDER BY a.[Score]', Fields: [f('ID', INT, false, ACCOUNT), f('Score', INT, false, ACCOUNT)] },
];

/** Template fixtures: parameters, requiredness, types and descriptions. */
const TEMPLATES: ExtractionFixture[] = [
    { Id: 'EF20', Title: 'required, optional-in-if and defaulted parameters with their filter types', Entities: [], Fields: ACCOUNT_KEY,
        SQL: "SELECT a.[ID], a.[Name] FROM mjit_sqlpipe.[Account] a WHERE a.[Score] >= {{ Min | sqlNumber }}{% if Region %} AND a.[Region] = {{ Region | sqlString }}{% endif %} AND a.[Name] LIKE {{ Prefix | default('Acct') | sqlLikeBegins }}",
        Parameters: [p('Min', 'number', true), p('Prefix', 'string', false, { DefaultValue: 'Acct' }), p('Region', 'string', false)] },
    { Id: 'EF21', Title: 'header doc comment and trailing --: descriptions', Entities: [],
        SQL: '{#\n * Accounts in one region.\n * @param {string} Region - The region to list.\n * @field ID The account key.\n#}\nSELECT a.[ID],\n       a.[Name] --: The display name.\nFROM mjit_sqlpipe.[Account] a WHERE a.[Region] = {{ Region | sqlString }}',
        Parameters: [p('Region', 'string', true, { Description: 'The region to list.' })],
        Fields: [f('ID', INT, false, ACCOUNT, { Description: 'The account key.' }), f('Name', N60, false, ACCOUNT, { Description: 'The display name.' })] },
    { Id: 'EF22', Title: 'arrays: a loop iterable and an IN list', Entities: [], Fields: [f('ID', INT, false, ACCOUNT)],
        SQL: "SELECT a.[ID] FROM mjit_sqlpipe.[Account] a WHERE a.[ID] IN {{ Ids | sqlIn }} AND a.[Region] IN ({% for R in Regions %}{{ R | sqlString }}{% if not loop.last %}, {% endif %}{% endfor %})",
        Parameters: [p('Ids', 'array', true), p('Regions', 'array', true)] },
    { Id: 'EF23', Title: 'date and boolean filters; a parameter used only in an if condition', Entities: [], Fields: [f('ID', INT, false, ACCOUNT)],
        SQL: 'SELECT a.[ID] FROM mjit_sqlpipe.[Account] a WHERE a.[OpenedAt] >= {{ Since | sqlDate }}{% if OnlyFlagged %} AND a.[Flag] = {{ Flagged | sqlBoolean }}{% endif %}',
        Parameters: [p('Flagged', 'boolean', false), p('OnlyFlagged', 'string', false), p('Since', 'date', true)] },
    { Id: 'EF24', Title: 'set variables and Context tokens are not parameters', Entities: [], Fields: [f('ID', INT, false, ACCOUNT)],
        SQL: '{% set Floor = 5 %}SELECT a.[ID] FROM mjit_sqlpipe.[Account] a WHERE a.[Score] >= {{ Floor }} AND a.[Name] <> {{ Context.UserEmail | sqlString }} AND a.[OpenedAt] <= {{ Context.Now | sqlDate }}',
        Parameters: [] },
    { Id: 'EF25', Title: 'the same parameter in an if, an elif and outside: required', Entities: [], Fields: [f('ID', INT, false, ACCOUNT)],
        SQL: "SELECT a.[ID] FROM mjit_sqlpipe.[Account] a WHERE {% if Band == 'hi' %}a.[Score] >= 50{% elif Band == 'lo' %}a.[Score] < 50{% else %}1 = 1{% endif %} AND a.[Name] <> {{ Band | sqlString }}",
        Parameters: [p('Band', 'string', true)] },
    { Id: 'EF26', Title: 'a .length guard and an inline if leave their parameters optional', Entities: [], Fields: [f('ID', INT, false, ACCOUNT)],
        SQL: 'SELECT a.[ID] FROM mjit_sqlpipe.[Account] a WHERE a.[Score] >= {{ Lo | sqlNumber if Lo else 10 }}{% if Ids and Ids.length > 0 %} AND a.[ID] IN {{ Ids | sqlIn }}{% endif %}',
        Parameters: [p('Ids', 'array', false), p('Lo', 'number', false)] },
    { Id: 'EF27', Title: 'branch-only columns are the union of every render', Entities: [],
        SQL: 'SELECT a.[ID]{% if WithName %}, a.[Name]{% endif %} FROM mjit_sqlpipe.[Account] a',
        Parameters: [p('WithName', 'string', false)], Fields: ACCOUNT_KEY,
        Status: 'OK', Message: 'Columns only some branches of the template return: Name (not in render 1).' },
];

/** Compositions of the bundle's reusable targets. */
const COMPOSITIONS: ExtractionFixture[] = [
    { Id: 'EF28', Title: 'a static argument', Parameters: [], Entities: [],
        SQL: 'SELECT x.[ID], x.[Name] FROM {{query:"{PATH}/{PREFIX} Accounts Above(Lo=10)"}} x',
        Fields: ACCOUNT_KEY, Dependencies: [{ Target: 'Accounts Above', Alias: 'x', Mapping: '{"Lo":"10"}' }] },
    { Id: 'EF29', Title: 'a pass-through argument inherits the type and the description of its target', Entities: [],
        SQL: 'SELECT x.[ID], x.[Name] FROM {{query:"{PATH}/{PREFIX} Accounts Above(Lo=Floor)"}} x',
        Parameters: [p('Floor', 'number', true, { Description: 'The lowest score kept. (passed through to "{PREFIX} Accounts Above" as "Lo")' })],
        Fields: ACCOUNT_KEY, Dependencies: [{ Target: 'Accounts Above', Alias: 'x', Mapping: '{"Lo":"@Floor"}' }] },
    { Id: 'EF30', Title: 'an arithmetic argument types its parameter from the target', Entities: [],
        SQL: 'SELECT x.[ID], x.[Name] FROM {{query:"{PATH}/{PREFIX} Accounts Above(Lo=Floor * 2)"}} x',
        Parameters: [p('Floor', 'number', true)], Fields: ACCOUNT_KEY,
        Dependencies: [{ Target: 'Accounts Above', Alias: 'x', Mapping: '{"Lo":"@{Floor * 2}"}' }] },
    { Id: 'EF31', Title: 'a Context-token argument into a core target', Entities: [],
        SQL: 'SELECT u.[ID], u.[Email] FROM {{query:"{PATH}/{PREFIX} Users By Email(Email=Context.UserEmail)"}} u',
        Parameters: [], Fields: [f('ID', UID, false, 'e:MJ: Users.ID'), f('Email', U100, false, 'e:MJ: Users.Email')],
        Dependencies: [{ Target: 'Users By Email', Alias: 'u', Mapping: '{"Email":"@{Context.UserEmail}"}' }] },
    { Id: 'EF32', Title: 'a composition joined to a mock table, with a CTE of its own', Entities: [],
        SQL: 'WITH lines AS (SELECT ol.[AccountID], ol.[Qty] FROM mjit_sqlpipe_ext.[Order Line] ol) SELECT x.[ID], l.[Qty] FROM {{query:"{PATH}/{PREFIX} Accounts Above(Lo=0)"}} x JOIN lines l ON l.[AccountID] = x.[ID]',
        Parameters: [], Fields: [f('ID', INT, false, ACCOUNT), f('Qty', INT, false, ORDER_LINE)],
        Dependencies: [{ Target: 'Accounts Above', Alias: 'x', Mapping: '{"Lo":"0"}' }] },
];

/** Core-schema fixtures: entity binding and Query Entities. */
const CORE: ExtractionFixture[] = [
    { Id: 'EF33', Title: 'core user columns bind to their MJ: Users fields', Parameters: [], Entities: ['MJ: Users'],
        SQL: 'SELECT u.[ID], u.[Name], u.[Email], u.[IsActive], u.[Type], u.[FirstName] FROM __mj.[vwUsers] u',
        Fields: [f('ID', UID, false, 'e:MJ: Users.ID'), f('Name', U100, false, 'e:MJ: Users.Name'), f('Email', U100, false, 'e:MJ: Users.Email'),
            f('IsActive', BIT, false, 'e:MJ: Users.IsActive'), f('Type', NCH15, false, 'e:MJ: Users.Type'), f('FirstName', U50, true, 'e:MJ: Users.FirstName')] },
    { Id: 'EF34', Title: 'a join of three entity views', Parameters: [], Entities: ['MJ: Roles', 'MJ: User Roles', 'MJ: Users'],
        SQL: 'SELECT u.[Email], r.[Name] AS [RoleName] FROM __mj.[vwUsers] u JOIN __mj.[vwUserRoles] ur ON ur.[UserID] = u.[ID] JOIN __mj.[vwRoles] r ON r.[ID] = ur.[RoleID]',
        Fields: [f('Email', U100, false, 'e:MJ: Users.Email'), f('RoleName', U50, false, 'e:MJ: Roles.Name')] },
    { Id: 'EF35', Title: 'an entity read only in a CTE and an IN subquery is listed', Parameters: [], Entities: ['MJ: Roles', 'MJ: User Roles'],
        SQL: 'WITH x AS (SELECT ur.[RoleID] FROM __mj.[vwUserRoles] ur) SELECT r.[Name] FROM __mj.[vwRoles] r WHERE r.[ID] IN (SELECT x.[RoleID] FROM x)',
        Fields: [f('Name', U50, false, 'e:MJ: Roles.Name')] },
    { Id: 'EF36', Title: 'an alias keeps the entity field binding', Parameters: [], Entities: ['MJ: Users'],
        SQL: 'SELECT u.[Email] AS [Mail], u.[Name] AS [Who] FROM __mj.[vwUsers] u',
        Fields: [f('Mail', U100, false, 'e:MJ: Users.Email'), f('Who', U100, false, 'e:MJ: Users.Name')] },
    { Id: 'EF37', Title: 'a CTE named like an entity view is not that entity', Parameters: [], Entities: ['MJ: Users'],
        SQL: 'WITH [vwApplications] AS (SELECT u.[ID], u.[Name] FROM __mj.[vwUsers] u) SELECT a.[ID], a.[Name] FROM [vwApplications] a',
        Fields: [f('ID', UID, false, 'e:MJ: Users.ID'), f('Name', U100, false, 'e:MJ: Users.Name')] },
    { Id: 'EF38', Title: 'an entity read only in an EXISTS subquery is listed', Parameters: [], Entities: ['MJ: Applications', 'MJ: Users'],
        SQL: 'SELECT u.[ID] FROM __mj.[vwUsers] u WHERE EXISTS (SELECT 1 FROM __mj.[vwApplications] a WHERE a.[Name] = u.[Name])',
        Fields: [f('ID', UID, false, 'e:MJ: Users.ID')] },
    { Id: 'EF39', Title: 'a count per role: computed, with the grouped column bound', Parameters: [], Entities: ['MJ: User Roles'],
        SQL: 'SELECT ur.[Role], COUNT(*) AS [Members] FROM __mj.[vwUserRoles] ur GROUP BY ur.[Role]',
        Fields: [f('Role', U50, false, 'e:MJ: User Roles.Role'), calc('Members', COUNT)] },
    { Id: 'EF40', Title: 'a core query with a parameter, a doc comment and a mock-schema join', Entities: ['MJ: Users'],
        SQL: '{#\n @param Email Skip this address.\n#}\nSELECT u.[ID], a.[Score] FROM __mj.[vwUsers] u CROSS JOIN mjit_sqlpipe.[Account] a WHERE u.[Email] <> {{ Email | sqlString }} AND a.[ID] = 1',
        Parameters: [p('Email', 'string', true, { Description: 'Skip this address.' })],
        Fields: [f('ID', UID, false, 'e:MJ: Users.ID'), f('Score', INT, false, ACCOUNT)] },
];

export const FIXTURES: readonly ExtractionFixture[] = [...MOCK_FIELDS, ...MOCK_SQLSERVER, ...TEMPLATES, ...COMPOSITIONS, ...CORE];
