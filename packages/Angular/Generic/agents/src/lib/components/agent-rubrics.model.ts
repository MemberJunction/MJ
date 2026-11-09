import { UUIDsEqual } from '@memberjunction/global';

export interface AgentRubricLink {
    ID?: string;
    Purpose?: string;
    Status?: string;
    IsDefault?: boolean | number;
    Sequence?: number;
    Rubric?: string;
    SampleRate?: number | string | null;
    PassThreshold?: number | string | null;
    MaxSelfCheckAttempts?: number | string | null;
    EvaluatorConfig?: string | null;
}

export interface AgentRubricDraft {
    purpose: 'Evaluation' | 'ProductionSampling' | 'SelfCheck';
    sampleRate: number | null;
    passThreshold: number | null;
    maxSelfCheckAttempts: number | null;
    evaluatorConfig: string | null;
    isDefault: boolean;
}

/** Fields for a new or edited link. Production sampling is refused until it has a sample rate. */
export function LinkDraft(input: {
    purpose?: string | null;
    sampleRate?: number | string | null;
    passThreshold?: number | string | null;
    maxSelfCheckAttempts?: number | string | null;
    evaluatorConfig?: string | null;
    isDefault?: boolean | number | null;
}): AgentRubricDraft | { error: string } {
    const purpose = input.purpose === 'ProductionSampling' || input.purpose === 'SelfCheck' ? input.purpose : 'Evaluation';
    const sampleRate = finiteNumber(input.sampleRate);
    if (purpose === 'ProductionSampling' && sampleRate == null) return { error: 'Production sampling needs a sample rate.' };
    const config = input.evaluatorConfig?.trim() ?? '';
    return {
        purpose,
        sampleRate,
        passThreshold: finiteNumber(input.passThreshold),
        maxSelfCheckAttempts: wholeNumber(input.maxSelfCheckAttempts),
        evaluatorConfig: config.length > 0 ? config : null,
        isDefault: input.isDefault === true || input.isDefault === 1,
    };
}

function finiteNumber(value: number | string | null | undefined): number | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function wholeNumber(value: number | string | null | undefined): number | null {
    const parsed = finiteNumber(value);
    return parsed == null ? null : Math.trunc(parsed);
}

function isDefault(row: AgentRubricLink): boolean {
    return (row.IsDefault === true || row.IsDefault === 1) && row.Status !== 'Disabled';
}

/** Active defaults first, then purpose, then sequence. A disabled link is not a default. */
export function SortAgentRubrics<T extends AgentRubricLink>(rows: T[]): T[] {
    const purposeOrder = (purpose: string | undefined) => purpose === 'Evaluation' ? 0 : purpose === 'SelfCheck' ? 1 : 2;
    return [...rows].sort((left, right) =>
        Number(isDefault(right)) - Number(isDefault(left))
        || purposeOrder(left.Purpose) - purposeOrder(right.Purpose)
        || Number(left.Sequence ?? 0) - Number(right.Sequence ?? 0)
        || String(left.Rubric ?? '').localeCompare(String(right.Rubric ?? '')));
}

/** The chosen link becomes the only Active default for its purpose. Disabled links are left alone. */
export function MakeDefaultLink<T extends AgentRubricLink>(rows: T[], chosenId: string): T[] {
    const chosen = rows.find(row => UUIDsEqual(row.ID, chosenId));
    const purpose = chosen?.Purpose;
    return rows.map(row => {
        if (UUIDsEqual(row.ID, chosenId)) return { ...row, IsDefault: true, Status: row.Status === 'Disabled' ? 'Active' : row.Status };
        if (row.Purpose === purpose && row.Status !== 'Disabled') return { ...row, IsDefault: false };
        return row;
    });
}

/** Keep the row and stop using it. A disabled link is not a default. */
export function DisableLink<T extends AgentRubricLink>(row: T): T {
    return { ...row, Status: 'Disabled', IsDefault: false };
}

