/**
 * @fileoverview Pure formatting and record types for sub-agent Chat consultation.
 *
 * Extracted as a standalone module so unit tests can import and verify
 * consult message and response-form formatting directly.
 *
 * @module @memberjunction/ai-agents
 */

import { AgentResponseForm, FormQuestion } from '@memberjunction/ai-core-plus';

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
        .map(
            c =>
                `You asked your caller about a question from sub-agent ${c.subAgentName} (run ${c.childRunId}, round ${c.round}): ${c.question ?? ''}. Their answer follows. To pass it on, call ${c.subAgentName} with resumeRunId: "${c.childRunId}".`
        )
        .join('\n');
}

