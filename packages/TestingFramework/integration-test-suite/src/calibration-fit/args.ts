/**
 * @fileoverview Arguments of `rigs/fit-decision-calibration.ts`, parsed without I/O so they can be
 * tested.
 *
 * @module @memberjunction/integration-test-suite
 */

import type { CalibrationTargetPrior } from '@memberjunction/testing-engine';

export const FIT_CALIBRATION_USAGE = [
    'usage: fit-decision-calibration.ts --out <dir> (--points <points.jsonl> | --labels <labels.jsonl> [--use <use>])',
    '         [--target-prior <p> | --target-prior <use>=<p>[,<use>=<p>…][,*=<p>]]',
    '         [--min-points 30] [--min-per-class 5] [--folds 5] [--seed <n>] [--threshold 0.5]',
    '         [--corpus-label "<text>"] [--force]'
].join('\n');

/** Where the points come from: a points file, or labels joined to decision prompt runs in the database. */
export type FitCalibrationSource =
    | { Kind: 'points'; PointsPath: string }
    | { Kind: 'labels'; LabelsPath: string; Use: string | undefined };

/** The rig's arguments. */
export interface FitCalibrationArgs {
    Source: FitCalibrationSource;
    OutDir: string;
    TargetPrior: CalibrationTargetPrior | undefined;
    MinPoints: number | undefined;
    MinPerClass: number | undefined;
    Folds: number | undefined;
    Seed: number | undefined;
    Threshold: number | undefined;
    CorpusLabel: string | undefined;
    /** Replace an earlier run of this rig in `OutDir`. */
    Force: boolean;
}

/**
 * Parses the rig's arguments. Throws with the usage when they are incomplete or contradictory.
 *
 * @param argv The arguments after the script name.
 */
export function ParseFitCalibrationArgs(argv: readonly string[]): FitCalibrationArgs {
    const points = readFlag(argv, 'points');
    const labels = readFlag(argv, 'labels');
    const out = readFlag(argv, 'out');
    if (!out || (points === undefined) === (labels === undefined)) {
        throw new Error(`Give --out and exactly one of --points and --labels.\n${FIT_CALIBRATION_USAGE}`);
    }
    if (points !== undefined && readFlag(argv, 'use') !== undefined) {
        throw new Error(`--use applies to --labels only: a points file names each point's use.\n${FIT_CALIBRATION_USAGE}`);
    }
    return {
        Source: points !== undefined ? { Kind: 'points', PointsPath: points } : { Kind: 'labels', LabelsPath: labels ?? '', Use: readFlag(argv, 'use') },
        OutDir: out,
        TargetPrior: ParseTargetPrior(readFlag(argv, 'target-prior')),
        MinPoints: readPositiveInt(argv, 'min-points'),
        MinPerClass: readPositiveInt(argv, 'min-per-class'),
        Folds: readPositiveInt(argv, 'folds'),
        Seed: readInteger(argv, 'seed'),
        Threshold: readShare(argv, 'threshold'),
        CorpusLabel: readFlag(argv, 'corpus-label'),
        Force: argv.includes('--force')
    };
}

/**
 * Reads `--target-prior`: one share for every use (`0.9`), or shares by use
 * (`conversation-routing=0.9,*=0.3`, where `*` covers the uses not named).
 *
 * @param raw The flag's value, or undefined when it was not given.
 */
export function ParseTargetPrior(raw: string | undefined): CalibrationTargetPrior | undefined {
    if (raw === undefined) {
        return undefined;
    }
    if (!raw.includes('=')) {
        return parseShare(raw, '--target-prior');
    }
    const byUse: Record<string, number> = {};
    for (const part of raw.split(',')) {
        const [use, value, ...rest] = part.split('=');
        if (!use?.trim() || value === undefined || rest.length > 0) {
            throw new Error(`--target-prior: '${part}' is not <use>=<share>`);
        }
        byUse[use.trim()] = parseShare(value, `--target-prior ${use.trim()}`);
    }
    return byUse;
}

function readFlag(argv: readonly string[], name: string): string | undefined {
    const i = argv.indexOf(`--${name}`);
    if (i < 0) {
        return undefined;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
        throw new Error(`--${name} needs a value.\n${FIT_CALIBRATION_USAGE}`);
    }
    return value;
}

function readInteger(argv: readonly string[], name: string): number | undefined {
    const raw = readFlag(argv, name);
    if (raw === undefined) {
        return undefined;
    }
    const value = Number(raw);
    if (!Number.isInteger(value)) {
        throw new Error(`--${name} must be an integer, got '${raw}'`);
    }
    return value;
}

function readPositiveInt(argv: readonly string[], name: string): number | undefined {
    const value = readInteger(argv, name);
    if (value !== undefined && value <= 0) {
        throw new Error(`--${name} must be a positive integer, got '${value}'`);
    }
    return value;
}

function readShare(argv: readonly string[], name: string): number | undefined {
    const raw = readFlag(argv, name);
    return raw === undefined ? undefined : parseShare(raw, `--${name}`);
}

function parseShare(raw: string, what: string): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || value >= 1) {
        throw new Error(`${what} must be a share in (0, 1), got '${raw}'`);
    }
    return value;
}
