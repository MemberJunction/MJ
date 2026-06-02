/**
 * @fileoverview Generates the `pipeline` tool documentation injected into the agent's system prompt
 * (`_PIPELINE_TOOLS`). Teaches the value model, the verb catalog, the field-path grammar, and a few
 * worked examples. Pure function.
 *
 * @module @memberjunction/ai-agents
 */
import { GetAllOperators } from './operators';

const MAX_SOURCES_LISTED = 50;

/**
 * Build the pipeline docs. Returns '' when there are no sources — a pipeline's first stage must be
 * a capability (Action/artifact tool), so with none available pipelines are impossible.
 */
export function BuildPipelineToolDocs(sourceToolNames: string[]): string {
    if (sourceToolNames.length === 0) {
        return '';
    }
    const operators = GetAllOperators()
        .map((o) => `- **${o.name}** — ${o.description} _(args: ${o.argsHint})_`)
        .join('\n');

    return [
        '## Agent Pipelines',
        '',
        'Run a multi-step dataflow **server-side** so large intermediate results never enter your context. ' +
            'Emit a `pipeline` with a flat `steps` array; **values flow between stages as structured JSON** ' +
            '(arrays/objects), PowerShell-style — stages bind to fields, you do NOT re-parse text. Only the ' +
            'FINAL stage\'s value is returned to you. Reach for this whenever a step produces a large payload ' +
            'and you only need a slice/shape of it, or to chain several actions without paying context for the ' +
            'data passing between them.',
        '',
        '### Keep the final value SMALL',
        'Only the FINAL stage\'s value is returned to you — every intermediate stays server-side, so those tokens ' +
            'are saved. Make the last stage small: end with `select`/`count`/`first`, and **inside `map`, extract or ' +
            'reduce each element** (e.g. `grep` then `count`, or `select` a few fields). Do NOT let a `map` return ' +
            'whole fetched pages/records — that large payload would become your final value. Fetch big, return small.',
        '',
        '### Stage kinds (one verb per stage)',
        '- **Capability:** `{ "tool": "<name>", "with": { ...params }, "pipeInto": "<paramName>" }` — run an ' +
            'Action/artifact tool. `pipeInto` puts the whole upstream value into that param; omit it for a ' +
            'source (first stage). Params may use `{{ path }}` templates over the upstream value (`$`) or ' +
            'map/let bindings.',
        '- **Operators** (pure, applied to the upstream value):',
        operators,
        '- **`map`:** `{ "map": { "as": "row", "do": [ ...sub-stages ] } }` — run the sub-pipeline once per ' +
            'array element (`{{row.field}}` available inside). **`map` REPLACES the array with each element\'s ' +
            'FINAL sub-stage value** — it does NOT add a field to existing rows. Use it for per-element *actions/' +
            'transforms* (e.g. send an email per row), NOT to compute a column. To filter/sort/aggregate or keep ' +
            'fields, use the operators directly (`where`/`select`/`sort`/`groupBy`) — no `map` needed.',
        '- **`let`:** `{ "let": { "name": "x", "value": [ ...sub-stages ] } }` — capture a result as `{{x}}` ' +
            'for later stages; the main stream passes through unchanged (use for joins/correlation).',
        '',
        '### Field paths',
        'Used by `where`/`select`/`sort`/templates: `Status`, `Customer.Email`, `Results[0].Name`, `Items[*].SKU`. ' +
            '`where` predicates support `== != < > <= >= contains startsWith endsWith matches in` and `and/or/not`, ' +
            'e.g. `Balance > 0 and Status == \'Open\'`.',
        '',
        '### Input shapes — operators need an ARRAY',
        '`where`/`select`/`sort`/`distinct`/`first`/`last` operate on an **array of objects**. Tabular tools ' +
            '(`get_rows`) already hand you that array of row objects — pipe them straight into `where`/`select`, ' +
            'no unwrapping needed. If a source instead returns a wrapper object (e.g. `{ "Results": [...] }`), ' +
            'extract the array first with a `{ "jsonpath": "$.Results[*]" }` stage. When an operator reports ' +
            '"expects an array but received an object", read the listed keys and add exactly that `jsonpath` stage.',
        '',
        '### Sources available now',
        sourceToolNames.slice(0, MAX_SOURCES_LISTED).map((n) => `\`${n}\``).join(', ') +
            (sourceToolNames.length > MAX_SOURCES_LISTED ? ', …' : '') +
            ' (artifact tools take an `artifactId` param).',
        '',
        '### Examples',
        '```json',
        JSON.stringify(
            {
                pipeline: {
                    steps: [
                        { tool: sourceToolNames[0], with: {} },
                        { where: "Status == 'Rejected'" },
                        { select: ['ID', 'Email'] },
                        { first: 10 },
                    ],
                },
            },
            null,
            2,
        ),
        '```',
        'Batch action chain (intermediates never in context):',
        '```json',
        JSON.stringify(
            {
                pipeline: {
                    steps: [
                        { tool: sourceToolNames[0], with: {} },
                        { where: 'Balance > 0' },
                        { map: { as: 'row', do: [{ tool: sourceToolNames[0], with: { Note: '{{row.ID}}' } }] } },
                        { count: true },
                    ],
                },
            },
            null,
            2,
        ),
        '```',
        'Tabular artifact tool — `get_rows` yields the row objects directly; filter and shape them with no unwrapping:',
        '```json',
        JSON.stringify(
            {
                pipeline: {
                    steps: [
                        { tool: 'get_rows', with: { artifactId: 'A', start: 0, count: 500 } },
                        { where: "Department == 'Engineering' and Status == 'Active'" },
                        { select: ['EmployeeID', 'Name', 'Region'] },
                        { distinct: 'Region' },
                    ],
                },
            },
            null,
            2,
        ),
        '```',
        'Analytical question over a LARGE file — aggregate server-side, return a tiny summary (the raw ' +
            'rows never enter your context, so this works even when the file is too big to read whole):',
        '```json',
        JSON.stringify(
            {
                pipeline: {
                    steps: [
                        { tool: 'get_full', with: { artifactId: 'A' } },
                        { groupBy: { by: 'Category', sum: 'Amount', avg: 'Amount' } },
                        { sort: '-sum_Amount' },
                        { first: 10 },
                    ],
                },
            },
            null,
            2,
        ),
        '```',
    ].join('\n');
}
