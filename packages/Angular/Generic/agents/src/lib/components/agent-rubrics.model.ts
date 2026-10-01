export interface AgentRubricLink {
    ID?: string;
    Purpose?: string;
    Status?: string;
    IsDefault?: boolean | number;
    Sequence?: number;
    Rubric?: string;
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

/** @deprecated Use {@link SortAgentRubrics}. */
export function sortAgentRubrics<T extends AgentRubricLink>(rows: T[]): T[] {
    return SortAgentRubrics(rows);
}

/** The chosen link becomes the only Active default for its purpose. Disabled links are left alone. */
export function MakeDefaultLink<T extends AgentRubricLink>(rows: T[], chosenId: string): T[] {
    const chosen = rows.find(row => row.ID === chosenId);
    const purpose = chosen?.Purpose;
    return rows.map(row => {
        if (row.ID === chosenId) return { ...row, IsDefault: true, Status: row.Status === 'Disabled' ? 'Active' : row.Status };
        if (row.Purpose === purpose && row.Status !== 'Disabled') return { ...row, IsDefault: false };
        return row;
    });
}

/** @deprecated Use {@link MakeDefaultLink}. */
export function makeDefaultLink<T extends AgentRubricLink>(rows: T[], chosenId: string): T[] {
    return MakeDefaultLink(rows, chosenId);
}

/** Keep the row and stop using it. A disabled link is not a default. */
export function DisableLink<T extends AgentRubricLink>(row: T): T {
    return { ...row, Status: 'Disabled', IsDefault: false };
}

/** @deprecated Use {@link DisableLink}. */
export function disableLink<T extends AgentRubricLink>(row: T): T {
    return DisableLink(row);
}
