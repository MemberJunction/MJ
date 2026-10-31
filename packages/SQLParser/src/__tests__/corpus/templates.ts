/**
 * Synthetic corpus entries that carry MJ template tags (`{{ }}`, `{% %}`, `{# #}`) and composition
 * tokens (`{{query:"Path/Name(args)"}}`), in every SQL position: code, string literals, quoted
 * identifiers, comments, row caps and table sources.
 *
 * Some entries are deliberately unsafe (a tag inside a string literal or a quoted identifier):
 * the save-time rule refuses them, and the goldens record how today's methods read them.
 */
import type { CorpusEntry } from './types.js';

function ss(Id: string, Tags: string[], SQL: string): CorpusEntry {
    return { Id: `ss/${Id}`, Dialect: 'sqlserver', SQL, Tags: ['template', ...Tags] };
}

function pg(Id: string, Tags: string[], SQL: string): CorpusEntry {
    return { Id: `pg/${Id}`, Dialect: 'postgresql', SQL, Tags: ['template', ...Tags] };
}

/** A tag where a value goes, with and without SQL filters. */
const codePosition: CorpusEntry[] = [
    ss('tpl/filtered-string', ['template:code', 'filter'],
        'SELECT ID FROM dbo.Orders WHERE Status = {{ status | sqlString }}'),
    ss('tpl/filtered-number', ['template:code', 'filter'],
        'SELECT ID FROM dbo.Orders WHERE Total > {{ minTotal | sqlNumber }}'),
    ss('tpl/filtered-date', ['template:code', 'filter'],
        'SELECT ID FROM dbo.Orders WHERE CreatedAt >= {{ since | sqlDate }}'),
    ss('tpl/filtered-boolean', ['template:code', 'filter'],
        'SELECT ID FROM dbo.Users WHERE IsActive = {{ active | sqlBoolean }}'),
    ss('tpl/filtered-in', ['template:code', 'filter', 'template:in-list'],
        'SELECT ID FROM dbo.Orders WHERE Status IN {{ statuses | sqlIn }}'),
    ss('tpl/unfiltered-number', ['template:code', 'template:unfiltered'],
        'SELECT ID FROM dbo.Orders WHERE Total > {{ minTotal }}'),
    ss('tpl/unfiltered-string', ['template:code', 'template:unfiltered'],
        'SELECT ID FROM dbo.Orders WHERE Region = {{ region }}'),
    ss('tpl/default-filter', ['template:code', 'filter', 'template:default'],
        'SELECT ID FROM dbo.Orders WHERE Total > {{ minTotal | default(10) | sqlNumber }}'),
    ss('tpl/context-token', ['template:code', 'template:context'],
        'SELECT ID FROM dbo.Tasks WHERE OwnerID = {{ Context.UserID | sqlString }}'),
    ss('tpl/multiple-same-var', ['template:code', 'filter'],
        'SELECT ID FROM dbo.Orders WHERE CreatedAt >= {{ since | sqlDate }} OR ShippedAt >= {{ since | sqlDate }}'),
    ss('tpl/in-select-list', ['template:code', 'filter'],
        'SELECT ID, {{ label | sqlString }} AS Label FROM dbo.Orders'),
    ss('tpl/in-join-on', ['template:code', 'filter', 'join'],
        'SELECT o.ID FROM dbo.Orders o JOIN dbo.Customers c ON c.ID = o.CustomerID AND c.Region = {{ region | sqlString }}'),
    ss('tpl/in-having', ['template:code', 'filter', 'group-by'],
        'SELECT Region, COUNT(*) AS N FROM dbo.Orders GROUP BY Region HAVING COUNT(*) > {{ minCount | sqlNumber }}'),
    ss('tpl/in-cte', ['template:code', 'filter', 'cte'],
        'WITH Recent AS (SELECT ID, Total FROM dbo.Orders WHERE CreatedAt >= {{ since | sqlDate }}) SELECT r.ID FROM Recent r ORDER BY r.Total DESC'),
    ss('tpl/arithmetic-outside', ['template:code', 'template:arithmetic'],
        'SELECT ID FROM dbo.Sales WHERE FiscalYear = CAST({{ TargetYear }} - 1 AS NVARCHAR)'),
    ss('tpl/arithmetic-inside', ['template:code', 'template:arithmetic'],
        'SELECT ID FROM dbo.Sales WHERE FiscalYear = {{ TargetYear - 1 }}'),
    pg('tpl/filtered-string', ['template:code', 'filter'],
        'SELECT id FROM orders WHERE status = {{ status | sqlString }}'),
    pg('tpl/filtered-in', ['template:code', 'filter', 'template:in-list'],
        'SELECT id FROM orders WHERE status IN {{ statuses | sqlIn }}'),
    pg('tpl/in-cte-quoted', ['template:code', 'filter', 'cte', 'quoted-ident'],
        'WITH recent AS (SELECT "ID", "Total" FROM "__mj"."vwOrders" WHERE "CreatedAt" >= {{ since | sqlDate }}) SELECT r."ID" FROM recent r'),
    pg('tpl/cast-shorthand', ['template:code', 'filter', 'cast'],
        'SELECT id FROM orders WHERE total > {{ minTotal | sqlNumber }}::numeric'),
];

/** A tag inside a string literal, quoted identifier or comment: the unsafe and inert positions. */
const otherPositions: CorpusEntry[] = [
    ss('tpl/inside-string', ['template:string-literal', 'unsafe'],
        'SELECT r.ID FROM dbo.vwAgentRuns r WHERE r.ID = \'{{ agentRunID }}\''),
    ss('tpl/inside-like-string', ['template:string-literal', 'unsafe'],
        'SELECT ID FROM dbo.Actions WHERE Name LIKE \'{{ Prefix }}%\''),
    ss('tpl/inside-wildcard-string', ['template:string-literal', 'unsafe'],
        'SELECT ID FROM dbo.Actions WHERE Name LIKE \'%{{ term }}%\''),
    ss('tpl/inside-bracket-ident', ['template:quoted-identifier', 'unsafe'],
        'SELECT t.[{{ columnName }}] FROM dbo.Things t'),
    ss('tpl/as-table-name', ['template:identifier', 'unsafe'],
        'SELECT ID FROM {{ schemaName }}.{{ tableName }}'),
    ss('tpl/inside-line-comment', ['template:comment'],
        'SELECT ID FROM dbo.Orders -- filtered by {{ status }}\nWHERE Status = {{ status | sqlString }}'),
    ss('tpl/inside-block-comment', ['template:comment'],
        'SELECT ID /* {{ ignored }} and {% if x %} */ FROM dbo.Orders'),
    ss('tpl/template-comment', ['template:template-comment'],
        '{# @param status The order status to keep #}\nSELECT ID FROM dbo.Orders WHERE Status = {{ status | sqlString }}'),
    ss('tpl/doc-comment-fields', ['template:template-comment', 'doc-comment'],
        'SELECT ID, --: the order key\n  Total --: order total in USD\nFROM dbo.Orders'),
    pg('tpl/inside-quoted-ident', ['template:quoted-identifier', 'unsafe'],
        'SELECT t."{{ columnName }}" FROM things t'),
    pg('tpl/inside-string', ['template:string-literal', 'unsafe'],
        'SELECT id FROM agent_runs WHERE id = \'{{ agentRunID }}\''),
    pg('tpl/inside-dollar-quote', ['template:string-literal', 'dollar-quoted'],
        'SELECT id, $${{ notATag }}$$ AS label FROM alpha'),
];

/** Block tags: conditional and loop structure, including branches that change the statement shape. */
const blocks: CorpusEntry[] = [
    ss('tpl/if-optional-filter', ['template:if'],
        'SELECT ID FROM dbo.Orders WHERE 1 = 1 {% if status %} AND Status = {{ status | sqlString }} {% endif %}'),
    ss('tpl/if-else-structural', ['template:if', 'template:structural'],
        'SELECT ID, Total FROM dbo.Orders {% if region %} WHERE Region = {{ region | sqlString }} {% else %} WHERE Region IS NULL {% endif %} ORDER BY Total'),
    ss('tpl/if-elif-else', ['template:if'],
        'SELECT ID FROM dbo.Orders WHERE {% if mode == \'big\' %} Total > 1000 {% elif mode == \'small\' %} Total < 10 {% else %} 1 = 1 {% endif %}'),
    ss('tpl/if-adds-join', ['template:if', 'template:structural', 'join'],
        'SELECT o.ID FROM dbo.Orders o {% if withCustomer %} JOIN dbo.Customers c ON c.ID = o.CustomerID {% endif %} WHERE o.Total > 0'),
    ss('tpl/if-adds-column', ['template:if', 'template:structural'],
        'SELECT o.ID{% if includeTotal %}, o.Total{% endif %} FROM dbo.Orders o'),
    ss('tpl/for-loop', ['template:for'],
        'SELECT ID FROM dbo.Orders WHERE {% for s in statuses %}{% if not loop.first %} OR {% endif %}Status = {{ s | sqlString }}{% endfor %}'),
    ss('tpl/set-variable', ['template:set'],
        '{% set Prior = TargetYear - 1 %}SELECT ID FROM dbo.Sales WHERE FiscalYear = {{ Prior | sqlNumber }}'),
    ss('tpl/whitespace-control', ['template:if', 'template:whitespace'],
        'SELECT ID FROM dbo.Orders WHERE 1 = 1\n{%- if status %}\n  AND Status = {{ status | sqlString }}\n{%- endif %}'),
    ss('tpl/nested-if', ['template:if'],
        'SELECT ID FROM dbo.Orders WHERE 1 = 1 {% if a %}{% if b %} AND B = {{ b | sqlNumber }}{% endif %} AND A = {{ a | sqlNumber }}{% endif %}'),
    pg('tpl/if-else-structural', ['template:if', 'template:structural'],
        'SELECT id, total FROM orders {% if region %} WHERE region = {{ region | sqlString }} {% else %} WHERE region IS NULL {% endif %} ORDER BY total'),
    pg('tpl/for-loop', ['template:for'],
        'SELECT id FROM orders WHERE {% for s in statuses %}{% if not loop.first %} OR {% endif %}status = {{ s | sqlString }}{% endfor %}'),
];

/** Row caps and ORDER BY driven by tags. */
const capsAndOrder: CorpusEntry[] = [
    ss('tpl/top-number', ['template:code', 'top', 'filter'],
        'SELECT TOP {{ n | sqlNumber }} ID FROM dbo.Orders ORDER BY CreatedAt DESC'),
    ss('tpl/top-paren', ['template:code', 'top'],
        'SELECT TOP ({{ n }}) ID FROM dbo.Orders ORDER BY ID'),
    ss('tpl/order-by-if', ['template:if', 'order-by'],
        'SELECT ID, Total FROM dbo.Orders {% if sortByTotal %} ORDER BY Total DESC {% else %} ORDER BY ID {% endif %}'),
    ss('tpl/order-by-identifier', ['template:code', 'order-by', 'filter'],
        'SELECT ID, Total FROM dbo.Orders ORDER BY {{ sortColumn | sqlIdentifier }}'),
    pg('tpl/limit-number', ['template:code', 'limit', 'filter'],
        'SELECT id FROM orders ORDER BY created_at DESC LIMIT {{ n | sqlNumber }}'),
];

/** Composition tokens: query references used as table sources, with and without arguments. */
const compositions: CorpusEntry[] = [
    ss('comp/no-args', ['composition'],
        'SELECT b.ID, b.Name FROM {{query:"Demo/Base Widgets"}} b'),
    ss('comp/static-args', ['composition', 'composition:static-args'],
        'SELECT r.* FROM {{query:"Reports/By Region(region=\'West\', limit=10)"}} r'),
    ss('comp/pass-through', ['composition', 'composition:pass-through'],
        'SELECT y.* FROM {{query:"Sales/By Year(TargetYear=TargetYear)"}} y'),
    ss('comp/pass-through-arithmetic', ['composition', 'composition:arithmetic'],
        'SELECT y.* FROM {{query:"Sales/By Year(TargetYear=TargetYear - 1)"}} y'),
    ss('comp/swap-args', ['composition', 'composition:swap'],
        'SELECT x.* FROM {{query:"Demo/Two Vars(A=B, B=A)"}} x'),
    ss('comp/two-refs-join', ['composition', 'join'],
        'SELECT a.Month, a.Revenue, b.Members FROM {{query:"Analytics/Revenue By Month"}} a JOIN {{query:"Analytics/Member Counts"}} b ON a.Month = b.Month'),
    ss('comp/in-subquery', ['composition', 'subquery'],
        'SELECT ID FROM dbo.Customers WHERE ID IN (SELECT CustomerID FROM {{query:"Customers/Active"}})'),
    ss('comp/in-cte', ['composition', 'cte'],
        'WITH Base AS (SELECT * FROM {{query:"Demo/Base Widgets"}}) SELECT b.ID FROM Base b ORDER BY b.ID'),
    ss('comp/inside-if', ['composition', 'template:if'],
        'SELECT c.ID FROM dbo.Customers c {% if includePrior %} JOIN {{query:"Sales/By Year(TargetYear=TargetYear)"}} p ON p.CustomerID = c.ID {% endif %}'),
    ss('comp/inside-for', ['composition', 'template:for'],
        '{% for y in years %}{% if not loop.first %} UNION ALL {% endif %}SELECT * FROM {{query:"Sales/By Year(TargetYear=y)"}}{% endfor %}'),
    ss('comp/inside-comment', ['composition', 'template:comment'],
        'SELECT ID FROM dbo.Customers -- was {{query:"Old/Thing"}}\n'),
    ss('comp/nested-tag-arg', ['composition', 'composition:nested-tag'],
        'SELECT * FROM {{query:"Path/Q(startDate={{StartDate}})"}} q'),
    ss('comp/with-own-filter', ['composition', 'filter'],
        'SELECT b.ID FROM {{query:"Demo/Base Widgets"}} b WHERE b.CategoryID = {{ categoryID | sqlString }}'),
    pg('comp/no-args', ['composition'],
        'SELECT b.id, b.name FROM {{query:"Demo/Base Widgets"}} b'),
    pg('comp/pass-through', ['composition', 'composition:pass-through'],
        'SELECT y.* FROM {{query:"Sales/By Year(TargetYear=TargetYear)"}} y WHERE y.total > {{ minTotal | sqlNumber }}'),
];

/** Every synthetic entry that carries template tags or composition tokens. */
export const TemplateEntries: CorpusEntry[] = [
    ...codePosition, ...otherPositions, ...blocks, ...capsAndOrder, ...compositions,
];
