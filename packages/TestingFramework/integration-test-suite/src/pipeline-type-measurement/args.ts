/**
 * args.ts — parses the measurement rig's command line into {@link MeasurementOptions}.
 *
 * Pure: argv in, options out, or an Error that names what is wrong. Unknown flags are refused, so a
 * typo (`--sampel 50`) fails loudly instead of silently measuring the default.
 */
import type { MeasurementOptions } from './types';

/** The default sample size, split as evenly as the data allows across `--values`. */
export const DEFAULT_SAMPLE_SIZE = 200;
/** The default number of reps per pipeline type. Two reps give repeatability. */
export const DEFAULT_REPS = 2;
/** The default seed for the stratified sample and the bootstrap. */
export const DEFAULT_SEED = 7;
/** Records per `ProcessBatch` call: `RecordSetProcessor`'s own default batch size. */
export const DEFAULT_BATCH_SIZE = 100;
/** The default Decision prompt. */
export const DEFAULT_DECISION_PROMPT = 'Default Decision';

/** The rig's usage line, printed with every argument error. */
export const MEASUREMENT_USAGE =
    'Usage: npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipeline-type-measurement.ts ' +
    '--entity "<entity>" --text-fields <f1,f2> --label-field <field> --values "<v1,v2,...>" ' +
    '--llm-prompt "<prompt name>" --out <dir outside any git working tree> ' +
    '[--decision-prompt "Default Decision"] [--llm-model "<model>"] [--decision-model "<model>"] [--require-model] ' +
    '[--sample 200] [--reps 2] [--seed 7] [--batch-size 100] [--allow-db <database name>] [--dry-run]';

const VALUE_FLAGS = [
    'entity', 'text-fields', 'label-field', 'values', 'sample', 'reps', 'seed', 'batch-size', 'llm-prompt', 'decision-prompt', 'out',
    'llm-model', 'decision-model', 'allow-db',
];
const SWITCH_FLAGS = ['dry-run', 'require-model'];

/**
 * Parses the rig's arguments.
 * @throws Error naming the problem (with the usage line) when a flag is missing, unknown or invalid.
 */
export function ParseMeasurementArgs(argv: readonly string[]): MeasurementOptions {
    assertKnownFlags(argv);
    const options: MeasurementOptions = {
        EntityName: requireFlag(argv, 'entity'),
        TextFields: readList(argv, 'text-fields'),
        LabelField: requireFlag(argv, 'label-field'),
        Values: readList(argv, 'values'),
        SampleSize: readInteger(argv, 'sample', DEFAULT_SAMPLE_SIZE, 1),
        Reps: readInteger(argv, 'reps', DEFAULT_REPS, 1),
        Seed: readInteger(argv, 'seed', DEFAULT_SEED, 0),
        BatchSize: readInteger(argv, 'batch-size', DEFAULT_BATCH_SIZE, 1),
        LLMPromptName: requireFlag(argv, 'llm-prompt'),
        DecisionPromptName: readFlag(argv, 'decision-prompt') ?? DEFAULT_DECISION_PROMPT,
        LLMModelName: readOptionalName(argv, 'llm-model'),
        DecisionModelName: readOptionalName(argv, 'decision-model'),
        RequireModel: argv.includes('--require-model'),
        AllowDatabase: readOptionalName(argv, 'allow-db'),
        OutDir: requireFlag(argv, 'out'),
        DryRun: argv.includes('--dry-run'),
    };
    assertConsistent(options);
    return options;
}

/** Refuses any `--flag` the rig does not know. */
function assertKnownFlags(argv: readonly string[]): void {
    const unknown = argv.filter((arg) => arg.startsWith('--')).map((arg) => arg.slice(2)).filter((name) => !VALUE_FLAGS.includes(name) && !SWITCH_FLAGS.includes(name));
    if (unknown.length > 0) {
        throw argumentError(`Unknown flag(s): ${unknown.map((name) => `--${name}`).join(', ')}.`);
    }
}

/** Checks what no single flag can: at least one text field, two distinct values, and no label among the text fields. */
function assertConsistent(options: MeasurementOptions): void {
    if (options.TextFields.length === 0) {
        throw argumentError('--text-fields must name at least one field.');
    }
    const lowered = options.Values.map((v) => v.toLowerCase());
    if (options.Values.length < 2 || new Set(lowered).size !== lowered.length) {
        throw argumentError('--values must list at least two distinct values.');
    }
    if (options.TextFields.some((f) => f.toLowerCase() === options.LabelField.toLowerCase())) {
        throw argumentError(`--text-fields must not include the label field '${options.LabelField}': the prompt would see the answer.`);
    }
}

function readFlag(argv: readonly string[], name: string): string | undefined {
    const index = argv.indexOf(`--${name}`);
    if (index < 0) {
        return undefined;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
        throw argumentError(`--${name} needs a value.`);
    }
    return value;
}

function requireFlag(argv: readonly string[], name: string): string {
    const value = readFlag(argv, name)?.trim();
    if (!value) {
        throw argumentError(`--${name} is required.`);
    }
    return value;
}

/** An optional name flag, trimmed; null when absent. A blank value is refused. */
function readOptionalName(argv: readonly string[], name: string): string | null {
    const raw = readFlag(argv, name);
    if (raw === undefined) {
        return null;
    }
    if (!raw.trim()) {
        throw argumentError(`--${name} needs a value.`);
    }
    return raw.trim();
}

function readList(argv: readonly string[], name: string): string[] {
    return requireFlag(argv, name).split(',').map((v) => v.trim()).filter((v) => v.length > 0);
}

function readInteger(argv: readonly string[], name: string, fallback: number, min: number): number {
    const raw = readFlag(argv, name);
    if (raw === undefined) {
        return fallback;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min) {
        throw argumentError(`--${name} must be an integer of at least ${min}, but is '${raw}'.`);
    }
    return value;
}

function argumentError(message: string): Error {
    return new Error(`${message}\n${MEASUREMENT_USAGE}`);
}
