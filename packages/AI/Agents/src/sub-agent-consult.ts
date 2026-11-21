/**
 * @fileoverview Pure formatting and record types for sub-agent Chat consultation.
 *
 * Extracted as a standalone module so unit tests can import and verify
 * consult message and response-form formatting directly.
 *
 * @module @memberjunction/ai-agents
 */

import { AgentResponseForm, FormQuestion } from '@memberjunction/ai-core-plus';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { IsValidUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';

/**
 * Default maximum consultation rounds per `(parent run, sub-agent entity ID)` pair
 * when `MJAIAgentEntity.MaxSubAgentConsultRounds` is `null` or `undefined`.
 */
export const DEFAULT_MAX_SUB_AGENT_CONSULT_ROUNDS = 3;

/**
 * Metadata persisted in `MJAIAgentRunStepEntity.OutputData.consult` and tracked
 * in memory when a child sub-agent pauses with `FinalStep === 'Chat'` under `'Consult'`.
 */
export interface SubAgentConsultRecord {
    childRunId: string;
    subAgentId: string;
    subAgentName: string;
    round: number;
    question: string | null;
}

/**
 * Parameters for {@link FormatSubAgentConsultMessage}.
 */
export interface FormatSubAgentConsultMessageParams {
    subAgentName: string;
    round: number;
    maxRounds: number;
    question: string | null;
    responseForm?: AgentResponseForm | null;
    childRunId: string;
}

/**
 * Renders a compact plain-text summary of an {@link AgentResponseForm}
 * (`title`, `description`, and for each question its `label`, `type.type`,
 * option labels when present, and `required` flag).
 *
 * Returns `''` when `form` is `null`/`undefined` or has no title, description, or questions.
 */
export function FormatResponseFormSummary(form: AgentResponseForm | null | undefined): string {
    if (!form) {
        return '';
    }

    const title = form.title?.trim() || '';
    const description = form.description?.trim() || '';
    const questions = Array.isArray(form.questions) ? form.questions : [];

    if (!title && !description && questions.length === 0) {
        return '';
    }

    const lines: string[] = [];
    if (title) {
        lines.push(`Title: ${title}`);
    }
    if (description) {
        lines.push(`Description: ${description}`);
    }
    for (const question of questions) {
        lines.push(formatSingleQuestionSummary(question));
    }

    return lines.join('\n');
}

function formatSingleQuestionSummary(question: FormQuestion): string {
    const requiredText = question.required ? 'required' : 'optional';
    const typeName = question.type?.type ?? 'unknown';
    const optionLabels = extractQuestionOptionLabels(question);
    const optionsSuffix = optionLabels.length > 0 ? ` [${optionLabels.join(', ')}]` : '';
    return `- ${question.label} (${typeName}, ${requiredText})${optionsSuffix}`;
}

function extractQuestionOptionLabels(question: FormQuestion): string[] {
    const qType = question.type;
    if (!qType || !('options' in qType) || !Array.isArray(qType.options)) {
        return [];
    }
    return qType.options.map(opt => String(opt.label));
}

/**
 * Formats the consultation message injected into the parent agent's conversation
 * when a sub-agent pauses with `FinalStep === 'Chat'` under `'Consult'`.
 */
export function FormatSubAgentConsultMessage(params: FormatSubAgentConsultMessageParams): string {
    const questionText = params.question?.trim() ? params.question : '(no message provided)';
    const lines: string[] = [
        `## Sub-agent ${params.subAgentName} is asking you (round ${params.round} of ${params.maxRounds})`,
        `**Question:** ${questionText}`,
    ];

    const formSummary = FormatResponseFormSummary(params.responseForm);
    if (formSummary) {
        lines.push(`**Form:**\n${formSummary}`);
    }

    lines.push(`**Child run ID:** ${params.childRunId}`);
    lines.push(
        `To answer, call ${params.subAgentName} again with resumeRunId: "${params.childRunId}" and your answer as the message.`
    );
    lines.push(
        'Answer this question from what you already know, ask your own caller with a Chat step only if they alone can answer, or tell the sub-agent to proceed without it.'
    );

    return lines.join('\n');
}

/**
 * Formats the reminder message injected before the caller's answer when an agent run
 * resumes (`lastRunId` pointing to a prior run that paused with `FinalStep === 'Chat'`)
 * with one or more unanswered sub-agent consultations from that prior run.
 *
 * Returns `''` when `consults` is empty.
 */
export function FormatReloadedConsultsMessage(consults: ReadonlyArray<SubAgentConsultRecord>): string {
    if (!consults || consults.length === 0) {
        return '';
    }
    return consults
        .map(c => {
            const questionText = c.question?.trim() ? c.question.trim() : '(no message provided)';
            const sep = /[.?!]$/.test(questionText) ? '' : '.';
            return `You asked your caller about a question from sub-agent ${c.subAgentName} (run ${c.childRunId}, round ${c.round}): ${questionText}${sep} Their answer follows. To pass it on, call ${c.subAgentName} with resumeRunId: "${c.childRunId}".`;
        })
        .join('\n');
}

/**
 * Checks whether an agent (given by ID string or entity-like object) can own sub-agent
 * consultations — either via its own `ChatHandlingOption === 'Consult'` or an active
 * `MJAIAgentRelationshipEntity` row with `ChatHandlingOption === 'Consult'`.
 */
export function CanAgentOwnSubAgentConsults(
    agentOrId: string | { ID: string; ChatHandlingOption?: string | null }
): boolean {
    if (typeof agentOrId === 'object' && agentOrId !== null && agentOrId.ChatHandlingOption === 'Consult') {
        return true;
    }

    const agentId = typeof agentOrId === 'string' ? agentOrId : agentOrId?.ID;
    if (!agentId) {
        return false;
    }

    if (typeof agentOrId === 'string') {
        const found = AIEngine.Instance.Agents.find(a => UUIDsEqual(a.ID, agentId));
        if (found?.ChatHandlingOption === 'Consult') {
            return true;
        }
    }

    return AIEngine.Instance.AgentRelationships.some(
        ar =>
            ar.Status === 'Active' &&
            ar.ChatHandlingOption === 'Consult' &&
            UUIDsEqual(ar.AgentID, agentId)
    );
}

/**
 * Loads unanswered sub-agent consultations (`OutputData.consult`) from `MJ: AI Agent Run Steps`
 * for the specified `runId`. Returns every `Sub-Agent` step whose `OutputData.consult` record
 * does not have a later `Sub-Agent` step in the same run with `InputData.resumeRunId` matching
 * `consult.childRunId`.
 */
export async function LoadOpenSubAgentConsults(
    provider: IMetadataProvider,
    runId: string,
    contextUser: UserInfo
): Promise<SubAgentConsultRecord[]> {
    if (!IsValidUUID(runId)) return [];
    const rv = RunView.FromMetadataProvider(provider);
    const stepsResult = await rv.RunView<{
        StepNumber: number;
        InputData: string | null;
        OutputData: string | null;
    }>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID='${runId}' AND StepType='Sub-Agent'`,
        OrderBy: 'StepNumber ASC',
        Fields: ['StepNumber', 'InputData', 'OutputData'],
        ResultType: 'simple',
        BypassCache: true,
    }, contextUser);

    const steps = stepsResult.Success ? (stepsResult.Results || []) : [];
    if (steps.length === 0) {
        return [];
    }

    const resumedLater = new UUIDSet();
    const openConsultsReversed: SubAgentConsultRecord[] = [];
    for (let i = steps.length - 1; i >= 0; i--) {
        const consult = readStepConsultRecord(steps[i].OutputData);
        if (consult && !resumedLater.Has(consult.childRunId)) {
            openConsultsReversed.push(consult);
        }
        const resumedId = readStepResumeRunId(steps[i].InputData);
        if (resumedId != null) {
            resumedLater.Add(resumedId);
        }
    }
    return openConsultsReversed.reverse();
}

/** Parses `OutputData.consult` from a persisted Sub-Agent step row, or returns `null`. */
function readStepConsultRecord(outputDataJson: string | null): SubAgentConsultRecord | null {
    if (!outputDataJson) {
        return null;
    }
    try {
        const parsed: { consult?: Partial<SubAgentConsultRecord> } = JSON.parse(outputDataJson);
        const c = parsed?.consult;
        if (!c || typeof c.childRunId !== 'string' || !c.childRunId || typeof c.subAgentName !== 'string') {
            return null;
        }
        return {
            childRunId: c.childRunId,
            subAgentId: typeof c.subAgentId === 'string' ? c.subAgentId : '',
            subAgentName: c.subAgentName,
            round: typeof c.round === 'number' ? c.round : 1,
            question: typeof c.question === 'string' ? c.question : null,
        };
    } catch {
        return null;
    }
}

/** Parses `InputData.resumeRunId` from a persisted Sub-Agent step row, or returns `null`. */
function readStepResumeRunId(inputDataJson: string | null): string | null {
    if (!inputDataJson) {
        return null;
    }
    try {
        const parsed: { resumeRunId?: unknown } = JSON.parse(inputDataJson);
        return typeof parsed?.resumeRunId === 'string' && parsed.resumeRunId ? parsed.resumeRunId : null;
    } catch {
        return null;
    }
}


