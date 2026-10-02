import { CompareCodePoints } from './canonical.js';
import type { RubricNodeSnapshot, RubricVersionSnapshot } from './types.js';

/** One version, its criteria, anchors, bands, and scales, as rows the database returned. */
export interface SnapshotRows {
    version: unknown;
    rubricId: string;
    criteria: unknown[];
    anchors: unknown[];
    bands: unknown[];
    scales: unknown[];
    levels: unknown[];
}

/** The one snapshot every scorer uses. EvaluatorConfig JSON is parsed. Anchors are ordered. */
export function SnapshotFromRows(rows: SnapshotRows): RubricVersionSnapshot {
    const version = rows.version;
    const anchors = [...rows.anchors].sort((left, right) => {
        const sequence = number(field(left, 'Sequence')) - number(field(right, 'Sequence'));
        return sequence !== 0 ? sequence : CompareCodePoints(String(field(left, 'ID') ?? ''), String(field(right, 'ID') ?? ''));
    });
    return {
        id: String(field(version, 'ID') ?? ''),
        rubricId: rows.rubricId,
        majorVersion: numberOrNull(field(version, 'MajorVersion')),
        minorVersion: numberOrNull(field(version, 'MinorVersion')),
        patchVersion: numberOrNull(field(version, 'PatchVersion')),
        notApplicablePolicy: (text(field(version, 'NotApplicablePolicy')) || 'ExcludeAndRedistribute') as RubricVersionSnapshot['notApplicablePolicy'],
        passThreshold: numberOrNull(field(version, 'PassThreshold')),
        minimumCompleteness: numberOrNull(field(version, 'MinimumCompleteness')),
        instructions: textOrNull(field(version, 'Instructions')),
        scoreDisplayMin: number(field(version, 'ScoreDisplayMin')),
        scoreDisplayMax: number(field(version, 'ScoreDisplayMax') ?? 100),
        nodes: rows.criteria.map(row => NodeSnapshotFromRecord(row, anchors.filter(anchor => String(field(anchor, 'CriterionID')) === String(field(row, 'ID'))))),
        scales: rows.scales.map(scale => ({
            id: String(field(scale, 'ID') ?? ''),
            scaleType: (text(field(scale, 'ScaleType')) || 'Levels') as 'Levels' | 'Numeric',
            minValue: numberOrNull(field(scale, 'MinValue')),
            maxValue: numberOrNull(field(scale, 'MaxValue')),
            step: numberOrNull(field(scale, 'Step')),
            higherIsBetter: field(scale, 'HigherIsBetter') === true || field(scale, 'HigherIsBetter') === 1,
            levels: rows.levels.filter(level => {
                const scaleId = field(level, 'ScaleID');
                return scaleId == null || scaleId === '' || String(scaleId) === String(field(scale, 'ID'));
            }).map(level => ({
                id: String(field(level, 'ID') ?? ''),
                label: String(field(level, 'Label') ?? ''),
                value: number(field(level, 'Value')),
                normalizedValue: number(field(level, 'NormalizedValue')),
                description: textOrNull(field(level, 'Description')),
                sequence: number(field(level, 'Sequence')),
            })),
        })),
        bands: rows.bands.map(row => ({
            id: String(field(row, 'ID') ?? ''),
            label: String(field(row, 'Label') ?? ''),
            description: textOrNull(field(row, 'Description')),
            minScore: number(field(row, 'MinScore')),
            maxScore: number(field(row, 'MaxScore')),
            displayTone: text(field(row, 'DisplayTone')) || 'Neutral',
            sequence: number(field(row, 'Sequence')),
        })),
    };
}

/** One criterion or group row, including parsed EvaluatorConfig. */
export function NodeSnapshotFromRecord(row: unknown, anchors: unknown[] = []): RubricNodeSnapshot {
    return {
        id: String(field(row, 'ID') ?? ''),
        key: String(field(row, 'Key') ?? ''),
        parentId: textOrNull(field(row, 'ParentID')),
        name: String(field(row, 'Name') ?? field(row, 'Key') ?? ''),
        description: textOrNull(field(row, 'Description')),
        guidance: textOrNull(field(row, 'Guidance')),
        nodeType: field(row, 'NodeType') === 'Group' ? 'Group' : 'Criterion',
        scaleId: textOrNull(field(row, 'ScaleID')),
        weight: field(row, 'Weight') == null ? 1 : number(field(row, 'Weight')),
        isAdvisory: field(row, 'IsAdvisory') === true || field(row, 'IsAdvisory') === 1,
        isGate: field(row, 'IsGate') === true || field(row, 'IsGate') === 1,
        gateMinimumScore: numberOrNull(field(row, 'GateMinimumScore')),
        notApplicablePolicy: textOrNull(field(row, 'NotApplicablePolicy')) as RubricNodeSnapshot['notApplicablePolicy'],
        rollupMethod: textOrNull(field(row, 'RollupMethod')) as RubricNodeSnapshot['rollupMethod'],
        evidenceRequired: field(row, 'EvidenceRequired') === true || field(row, 'EvidenceRequired') === 1,
        rationaleRequired: field(row, 'RationaleRequired') === true || field(row, 'RationaleRequired') === 1,
        sequence: number(field(row, 'Sequence')),
        evaluatorConfig: parseConfig(field(row, 'EvaluatorConfig')),
        anchors: anchors.map(anchor => ({
            scaleLevelId: textOrNull(field(anchor, 'ScaleLevelID')),
            anchorValue: numberOrNull(field(anchor, 'AnchorValue')),
            descriptor: String(field(anchor, 'Descriptor') ?? ''),
        })),
    };
}

function field(row: unknown, name: string): unknown {
    const record = row as Record<string, unknown> & { Get?: (fieldName: string) => unknown };
    if (record && record[name] === undefined && typeof record.Get === 'function') return record.Get(name);
    return record?.[name];
}

function parseConfig(value: unknown): unknown {
    if (typeof value !== 'string' || value.length === 0) return value ?? null;
    try {
        return JSON.parse(value);
    } catch (error) {
        throw new Error(`EvaluatorConfig is not valid JSON. ${error instanceof Error ? error.message : String(error)}`);
    }
}

function text(value: unknown): string {
    return value == null ? '' : String(value);
}

function textOrNull(value: unknown): string | null {
    if (value == null || value === '') return null;
    return String(value);
}

function number(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value: unknown): number | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
