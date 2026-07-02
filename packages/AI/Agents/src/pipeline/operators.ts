/**
 * @fileoverview The operator catalog — pure, object-aware value→value functions (PowerShell-style
 * cmdlets). Registered by verb; the executor applies them directly (no async/effects). Object ops
 * operate on arrays/objects; text ops coerce to text for genuinely-textual values.
 *
 * @module @memberjunction/ai-agents
 */
import { PipeValue, PipelineOperator } from './pipeline.types';
import { getValue, getValues } from './path';
import { parsePredicate, evaluatePredicate } from './predicate';
import { valueToText } from './coerce';

// ─── helpers ───

function requireArray(input: PipeValue, op: string): PipeValue[] {
    if (!Array.isArray(input)) {
        throw new Error(`"${op}" expects an array but received ${describe(input)}.${nonArrayHint(input)}`);
    }
    return input;
}

/**
 * Guard for the text-only operators (`head`/`tail`): reject arrays and point the agent at the
 * array equivalent. Keeps the verb choice unambiguous — `head`/`tail` operate on text LINES,
 * `first`/`last` operate on array ELEMENTS — instead of both silently slicing arrays.
 */
function rejectArray(input: PipeValue, op: string, arrayOp: string): void {
    if (Array.isArray(input)) {
        throw new Error(`"${op}" operates on text only; for the ${input.length}-element array use "${arrayOp}" instead.`);
    }
}

function describe(v: PipeValue): string {
    if (Array.isArray(v)) return 'an array';
    if (v === null) return 'null';
    return `a ${typeof v}`;
}

/**
 * When an array operator gets a non-array OBJECT, it's almost always because the upstream value is an
 * envelope wrapping the real collection (e.g. `{ Results: [...] }`). List the keys and, if one holds
 * an array, suggest the exact `jsonpath` to extract it — so the agent self-corrects next turn from
 * the message alone (the data isn't in its context). Returns '' for non-objects.
 */
function nonArrayHint(input: PipeValue): string {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        return '';
    }
    const keys = Object.keys(input);
    const arrayKey = keys.find((k) => Array.isArray((input as Record<string, PipeValue>)[k]));
    const path = arrayKey ? `$.${arrayKey}[*]` : '$.<field>[*]';
    return (
        ` Got an object with keys [${keys.join(', ')}].` +
        ` If the array is nested under a field, extract it first with a {"jsonpath":"${path}"} stage.`
    );
}

function asString(args: unknown, op: string): string {
    if (typeof args !== 'string' || args.trim() === '') {
        throw new Error(`"${op}" requires a non-empty string argument.`);
    }
    return args;
}

function asInt(args: unknown, op: string): number {
    const n = typeof args === 'number' ? args : parseInt(String(args), 10);
    if (!Number.isFinite(n)) {
        throw new Error(`"${op}" requires a numeric argument.`);
    }
    return Math.trunc(n);
}

function lastSegment(path: string): string {
    return (path.split('.').pop() ?? path).replace(/\[.*\]$/, '');
}

/** Numeric when both sides are numeric; else lexicographic on string forms. */
function compareValues(a: PipeValue | undefined, b: PipeValue | undefined): number {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
        return na - nb;
    }
    const sa = a == null ? '' : String(a);
    const sb = b == null ? '' : String(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function toLines(input: PipeValue): string[] {
    return valueToText(input).split('\n');
}

type AggOp = 'sum' | 'avg' | 'min' | 'max';

/** Reduce a list of numbers by an aggregation op. Empty → null (no numeric values in the group). */
function applyAggregate(op: AggOp, nums: number[]): PipeValue {
    if (nums.length === 0) return null;
    if (op === 'sum') return nums.reduce((a, b) => a + b, 0);
    if (op === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
    if (op === 'min') return Math.min(...nums);
    return Math.max(...nums);
}

// ─── object operators ───

const Where: PipelineOperator = {
    name: 'where',
    description: 'Keep array elements matching a predicate, e.g. "Balance > 0 and Status == \'Open\'".',
    argsHint: 'predicate string (==, !=, <, >, <=, >=, contains, startsWith, endsWith, matches, in; and/or/not)',
    apply(input, args) {
        const arr = requireArray(input, 'where');
        const ast = parsePredicate(asString(args, 'where'));
        return arr.filter((el) => evaluatePredicate(ast, el));
    },
};

const Select: PipelineOperator = {
    name: 'select',
    description: 'Project field(s) from each element. One field → array of values; many → array of objects.',
    argsHint: 'a field path string, or an array of field paths',
    apply(input, args) {
        const fields = (Array.isArray(args) ? args : [args]).map((f) => asString(f, 'select'));
        const project = (el: PipeValue): PipeValue => {
            if (fields.length === 1) {
                return getValue(el, fields[0]) ?? null;
            }
            return fields.reduce<{ [k: string]: PipeValue }>((o, f) => {
                o[lastSegment(f)] = getValue(el, f) ?? null;
                return o;
            }, {});
        };
        if (Array.isArray(input)) {
            return input.map(project);
        }
        // Projecting off a non-array object that has a nested array, where none of the requested
        // fields exist on the outer object, is the classic "forgot to extract the collection"
        // mistake — fail loudly with the extraction hint instead of silently returning null (which
        // would only surface as a confusing error one stage later).
        const allMissing = fields.every((f) => getValue(input, f) === undefined);
        if (allMissing && input !== null && typeof input === 'object' && Object.values(input).some(Array.isArray)) {
            throw new Error(`"select" found none of [${fields.join(', ')}] on this value.${nonArrayHint(input)}`);
        }
        return project(input);
    },
};

const Sort: PipelineOperator = {
    name: 'sort',
    description: 'Sort an array by field(s). Prefix a field with "-" for descending.',
    argsHint: 'a field path string (e.g. "-Balance"), or an array of them',
    apply(input, args) {
        const arr = requireArray(input, 'sort');
        const keys = (Array.isArray(args) ? args : [args]).map((k) => asString(k, 'sort'));
        return [...arr].sort((a, b) => {
            for (const key of keys) {
                const desc = key.startsWith('-');
                const path = desc ? key.slice(1) : key;
                const c = compareValues(getValue(a, path), getValue(b, path));
                if (c !== 0) {
                    return desc ? -c : c;
                }
            }
            return 0;
        });
    },
};

const First: PipelineOperator = {
    name: 'first',
    description: 'Keep the first N elements of an array.',
    argsHint: 'a number N',
    apply(input, args) {
        return requireArray(input, 'first').slice(0, Math.max(0, asInt(args, 'first')));
    },
};

const Last: PipelineOperator = {
    name: 'last',
    description: 'Keep the last N elements of an array.',
    argsHint: 'a number N',
    apply(input, args) {
        const arr = requireArray(input, 'last');
        const n = Math.max(0, asInt(args, 'last'));
        return arr.slice(Math.max(0, arr.length - n));
    },
};

const Count: PipelineOperator = {
    name: 'count',
    description: 'Replace the value with its size: array length, object key count, or string length.',
    argsHint: 'no arguments',
    apply(input) {
        if (Array.isArray(input)) return input.length;
        if (typeof input === 'string') return input.length;
        if (input !== null && typeof input === 'object') return Object.keys(input).length;
        return input == null ? 0 : 1;
    },
};

const Distinct: PipelineOperator = {
    name: 'distinct',
    description: 'Remove duplicate array elements, optionally by a field path.',
    argsHint: 'optional field path to dedupe by; omit (or pass true) to dedupe whole elements',
    apply(input, args) {
        const arr = requireArray(input, 'distinct');
        // A non-empty string arg dedupes by that field path; anything else (omitted, `true`, `{}`)
        // dedupes by the whole element — so `{ "distinct": true }` after a `select` works as expected.
        const field = typeof args === 'string' && args.trim() !== '' ? args : null;
        const seen = new Set<string>();
        const keyOf = (el: PipeValue): string =>
            field ? valueToText(getValue(el, field) ?? null) : valueToText(el);
        return arr.filter((el) => {
            const k = keyOf(el);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    },
};

const Flatten: PipelineOperator = {
    name: 'flatten',
    description: 'Flatten a nested array one level.',
    argsHint: 'no arguments',
    apply(input) {
        return requireArray(input, 'flatten').flatMap((el) => (Array.isArray(el) ? el : [el]));
    },
};

const GroupBy: PipelineOperator = {
    name: 'groupBy',
    description:
        'Group array elements by field(s) and aggregate. Each group gets a "count"; optionally add ' +
        'sum/avg/min/max of a numeric field (output keys like "sum_Amount"). This is how you answer ' +
        'analytical questions over large data without returning the rows.',
    argsHint:
        'a field path (count per group), or { "by": <field | [fields]>, "sum"?: field, "avg"?: field, "min"?: field, "max"?: field }',
    apply(input, args) {
        const arr = requireArray(input, 'groupBy');
        const cfg: Record<string, unknown> = typeof args === 'string' ? { by: args } : (args as Record<string, unknown>) ?? {};
        const byList = Array.isArray(cfg.by) ? cfg.by : [cfg.by];
        if (cfg.by == null || byList.some((f) => typeof f !== 'string' || f.trim() === '')) {
            throw new Error('groupBy needs a "by" field — the field to group on, e.g. { "by": "Category", "sum": "Amount" }.');
        }
        const byFields = byList as string[];
        const aggSpecs = (['sum', 'avg', 'min', 'max'] as const)
            .filter((op) => cfg[op] != null)
            .map((op) => {
                const field = cfg[op];
                if (typeof field !== 'string' || field.trim() === '') {
                    throw new Error(`groupBy "${op}" needs a numeric field name, e.g. { "by": "Category", "${op}": "Amount" }.`);
                }
                return { op, field };
            });

        const groups = new Map<string, { key: { [k: string]: PipeValue }; rows: PipeValue[] }>();
        for (const el of arr) {
            const key: { [k: string]: PipeValue } = {};
            for (const f of byFields) {
                key[lastSegment(f)] = getValue(el, f) ?? null;
            }
            const mapKey = valueToText(byFields.map((f) => getValue(el, f) ?? null));
            const existing = groups.get(mapKey);
            if (existing) {
                existing.rows.push(el);
            } else {
                groups.set(mapKey, { key, rows: [el] });
            }
        }

        return [...groups.values()].map(({ key, rows }) => {
            const out: { [k: string]: PipeValue } = { ...key, count: rows.length };
            for (const { op, field } of aggSpecs) {
                const nums = rows.map((r) => Number(getValue(r, field))).filter((n) => Number.isFinite(n));
                out[`${op}_${lastSegment(field)}`] = applyAggregate(op, nums);
            }
            return out;
        });
    },
};

const JsonPath: PipelineOperator = {
    name: 'jsonpath',
    description: 'Extract value(s) at a JSONPath (member/index/[*]/.. ). One match → the value; many → an array.',
    argsHint: 'a JSONPath string, e.g. "$.Results[*].Status"',
    apply(input, args) {
        const matches = getValues(input, asString(args, 'jsonpath'));
        if (matches.length === 0) return null;
        return matches.length === 1 ? matches[0] : matches;
    },
};

// ─── text operators (coerce-to-text) ───

const Lines: PipelineOperator = {
    name: 'lines',
    description: 'Split a string value into an array of lines (so object operators can work on it).',
    argsHint: 'no arguments',
    apply(input) {
        return toLines(input);
    },
};

const Grep: PipelineOperator = {
    name: 'grep',
    description: 'Keep matching lines/elements by regex. On a string → matching lines (joined); on an array → matching elements.',
    argsHint: '{ "pattern": "regex", "ignoreCase"?: bool, "invert"?: bool } or a bare pattern string',
    apply(input, args) {
        const opts = typeof args === 'string' ? { pattern: args } : (args as Record<string, unknown>);
        const pattern = asString(opts?.pattern, 'grep');
        const flags = opts?.ignoreCase ? 'i' : '';
        const invert = opts?.invert === true;
        let regex: RegExp;
        try {
            regex = new RegExp(pattern, flags);
        } catch (e) {
            throw new Error(`Invalid grep pattern "${pattern}": ${(e as Error).message}`);
        }
        const keep = (line: string): boolean => regex.test(line) !== invert;
        if (Array.isArray(input)) {
            return input.filter((el) => keep(valueToText(el)));
        }
        return toLines(input).filter(keep).join('\n');
    },
};

const Head: PipelineOperator = {
    name: 'head',
    description: 'First N LINES of a string (text only — use `first` for the first N array elements).',
    argsHint: 'a number N',
    apply(input, args) {
        rejectArray(input, 'head', 'first');
        const n = Math.max(0, asInt(args, 'head'));
        return toLines(input).slice(0, n).join('\n');
    },
};

const Tail: PipelineOperator = {
    name: 'tail',
    description: 'Last N LINES of a string (text only — use `last` for the last N array elements).',
    argsHint: 'a number N',
    apply(input, args) {
        rejectArray(input, 'tail', 'last');
        const n = Math.max(0, asInt(args, 'tail'));
        const lines = toLines(input);
        return lines.slice(Math.max(0, lines.length - n)).join('\n');
    },
};

const ALL: readonly PipelineOperator[] = [
    Where, Select, Sort, First, Last, Count, Distinct, Flatten, GroupBy, JsonPath, Lines, Grep, Head, Tail,
];

const BY_NAME: ReadonlyMap<string, PipelineOperator> = new Map(ALL.map((o) => [o.name, o]));

/** All operators, in catalog order (for docs). */
export function GetAllOperators(): readonly PipelineOperator[] {
    return ALL;
}

/** Resolve an operator by verb name (exact, lowercase verbs). */
export function GetOperator(name: string): PipelineOperator | undefined {
    return BY_NAME.get(name);
}

/** Reserved verbs that are NOT operators (control constructs + capability stages). */
export const CONTROL_VERBS: ReadonlySet<string> = new Set(['tool', 'map', 'let']);
