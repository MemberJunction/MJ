/**
 * native-tool-calling-shared.ts — the fixtures the `native-tool-calling-live` bundle runs (the report
 * Action's params, the agents' instructions and requests), and the validator that checks an Action's
 * received arguments against the params' `ValueSchema`s.
 */
import type { MJActionParamEntity, MJActionParamEntity_IActionParamValueSchema } from '@memberjunction/core-entities';

export type ParamSchema = MJActionParamEntity_IActionParamValueSchema;

/** One param of the report fixture Action. */
export interface ReportFixtureParam {
    Name: string;
    ValueType: MJActionParamEntity['ValueType'];
    IsArray: boolean;
    IsRequired: boolean;
    Description: string;
    Schema: ParamSchema;
}

/**
 * The report fixture Action's params. `Filters` is `ValueType: Other`, which on its own declares a
 * string to a model — its ValueSchema is what makes it an object.
 */
export const REPORT_PARAMS: readonly ReportFixtureParam[] = [
    { Name: 'ReportName', ValueType: 'Scalar', IsArray: false, IsRequired: true, Description: 'Name of the report to schedule.', Schema: { type: 'string' } },
    {
        Name: 'Filters', ValueType: 'Other', IsArray: false, IsRequired: true,
        Description: 'Filters for the report: Region (EMEA, AMER or APAC), TopCount (number of rows) and IncludeInactive (whether to include inactive accounts).',
        Schema: {
            type: 'object',
            properties: {
                Region: { type: 'string', enum: ['EMEA', 'AMER', 'APAC'] },
                TopCount: { type: 'integer', description: 'Number of rows to include.' },
                IncludeInactive: { type: 'boolean' }
            },
            required: ['Region', 'TopCount']
        }
    },
    { Name: 'Format', ValueType: 'Scalar', IsArray: false, IsRequired: true, Description: "Output format: 'csv', 'pdf' or 'xlsx'.", Schema: { type: 'string', enum: ['csv', 'pdf', 'xlsx'] } },
    { Name: 'Recipients', ValueType: 'Scalar', IsArray: true, IsRequired: true, Description: 'Email addresses to send the report to.', Schema: { type: 'string' } },
    { Name: 'Priority', ValueType: 'Scalar', IsArray: false, IsRequired: false, Description: 'Delivery priority from 1 (highest) to 5.', Schema: { type: 'integer' } }
];

/** Mode-neutral instructions: they name no protocol, so the same agent runs native and envelope. */
export const REPORT_AGENT_INSTRUCTIONS = `# Report Scheduler

You schedule reports. When the user asks for a report, call the report-scheduling action available to you exactly ONCE, filling every parameter from the request. Then finish with a one-sentence confirmation.

Rules:
- Never ask the user a clarifying question; everything you need is in the request.
- Call the action once only. Do not call any other action, sub-agent or tool.
- Do not request payload changes.`;

export const REPORT_REQUEST = 'Schedule the Quarterly Churn report: EMEA region only, top 25 rows, include inactive accounts. Send it as a PDF to ana@example.com and raj@example.com with priority 2.';

export const CHART_AGENT_INSTRUCTIONS = `# Chart Maker

You make one chart. When the user asks for a chart, call the Create SVG Chart action exactly ONCE with every setting from the request, then finish with a one-sentence confirmation.

Rules:
- Never ask the user a clarifying question.
- Call the action once only. Do not call any other action, sub-agent or tool.
- Do not request payload changes.`;

export const CHART_REQUEST = 'Make a bar chart titled "Tickets by Team" from this data: Support 42, Sales 17, Billing 23. Use the pastel palette, 640 pixels wide and 400 pixels high, with grid lines.';

/** A param's schema and whether it is an array, keyed by param name. */
export type ParamSchemaMap = ReadonlyMap<string, { Schema: ParamSchema; IsArray: boolean }>;

/** The JSON type of a value, telling integers from other numbers. */
export function JsonTypeOf(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
    return typeof value;
}

function typeProblem(value: unknown, schema: ParamSchema, path: string): string | null {
    if (schema.type === undefined) return null;
    const allowed: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = JsonTypeOf(value);
    if (allowed.includes(actual) || (actual === 'integer' && allowed.includes('number'))) return null;
    const shown = typeof value === 'string' ? ` ${JSON.stringify(value).slice(0, 60)}` : '';
    return `${path}: expected ${allowed.join('|')}, got ${actual}${shown}`;
}

function objectProblems(record: Record<string, unknown>, schema: ParamSchema, path: string): string[] {
    const problems: string[] = [];
    for (const name of schema.required ?? []) {
        if (!(name in record)) problems.push(`${path}.${name}: missing`);
    }
    for (const [name, child] of Object.entries(schema.properties ?? {})) {
        if (name in record) problems.push(...ValidateAgainstSchema(record[name], child, `${path}.${name}`));
    }
    return problems;
}

/** Checks one value against a schema in the `ValueSchema` subset; returns the problems found. */
export function ValidateAgainstSchema(value: unknown, schema: ParamSchema, path: string): string[] {
    const wrongType = typeProblem(value, schema, path);
    if (wrongType) return [wrongType];
    const problems: string[] = [];
    if (schema.enum && !schema.enum.includes(value as string | number | boolean | null)) {
        problems.push(`${path}: ${JSON.stringify(value)} not in ${JSON.stringify(schema.enum)}`);
    }
    if (Array.isArray(value) && schema.items) {
        const items = schema.items;
        value.forEach((item, i) => problems.push(...ValidateAgainstSchema(item, items, `${path}[${i}]`)));
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        problems.push(...objectProblems(value as Record<string, unknown>, schema, path));
    }
    return problems;
}

/**
 * Checks an Action's received arguments against each param's schema (array-wrapped for IsArray).
 * A param the call left out is not checked here; required-ness is the Action's to enforce.
 */
export function ValidateArguments(args: Record<string, unknown>, schemas: ParamSchemaMap): string[] {
    const problems: string[] = [];
    for (const [name, def] of schemas) {
        if (args[name] === undefined) continue;
        const schema: ParamSchema = def.IsArray ? { type: 'array', items: def.Schema } : def.Schema;
        problems.push(...ValidateAgainstSchema(args[name], schema, name));
    }
    return problems;
}

/** The report fixture's schemas, as a {@link ParamSchemaMap}. */
export function ReportParamSchemas(): ParamSchemaMap {
    return new Map(REPORT_PARAMS.map((p) => [p.Name, { Schema: p.Schema, IsArray: p.IsArray }]));
}
