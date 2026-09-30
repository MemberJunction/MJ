/**
 * @fileoverview Feedback mechanism for validating suspicious payload changes with LLMs
 *
 * This module provides a standardized way to query AI agents about potentially
 * unintended changes and receive structured yes/no confirmations.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 3.1.0
 */

import { LogStatus, LogError, UserInfo } from '@memberjunction/core';
import { DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
import { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { PayloadWarning } from './PayloadChangeAnalyzer';
import { AgentDecisionService } from './AgentDecisionService';

/**
 * Represents a single feedback question about a payload change
 */
export interface PayloadFeedbackQuestion {
    id: string;
    question: string;
    warning: PayloadWarning;
    context?: {
        path: string;
        changeType: string;
        details: any;
    };
}

/**
 * Response to a feedback question
 */
export interface PayloadFeedbackResponse {
    questionId: string;
    intended: boolean;
    explanation?: string;
    /**
     * The decision model's probability, in [0, 1], that the change was intended. Absent when the
     * change was accepted by default because no decision answered it.
     */
    probability?: number;
}

/**
 * Result of the feedback process
 */
export interface PayloadFeedbackResult {
    questions: PayloadFeedbackQuestion[];
    responses: PayloadFeedbackResponse[];
    acceptedChanges: string[];
    rejectedChanges: string[];
    requiresRevision: boolean;
}

/**
 * Configuration for payload feedback collection
 */
export interface PayloadFeedbackConfig {
    /** ID of the AI Prompt to use for feedback collection */
    feedbackPromptId?: string;
    /** Maximum number of questions to ask in a single batch */
    maxQuestionsPerBatch?: number;
    /** Temperature for feedback queries (lower = more deterministic) */
    temperature?: number;
    /**
     * A change is judged intended when the decision model's probability is at or above this
     * threshold (0 to 1).
     * @default 0.5
     */
    intendedThreshold?: number;
    /**
     * The decision prompt that answers the questions.
     * @default 'Default Decision' ({@link AgentDecisionService.DEFAULT_PROMPT_NAME})
     */
    decisionPromptName?: string;
}

/**
 * What the decision model reads about the step that changed the payload, and the options for the
 * call. It never carries the payload itself.
 */
export interface PayloadFeedbackContext {
    /** The agent's stated reasoning for the step. */
    Reasoning?: string;
    /** The reasoning the agent gave with its payload change request. */
    ChangeReasoning?: string;
    /** The agent's message for the step. */
    Message?: string;
    /** The agent asking, recorded on the decision's prompt run. */
    AgentID?: string;
    /**
     * Aborts the decision call. The call is also bounded by
     * {@link PayloadFeedbackManager.DECISION_TIMEOUT_MS}.
     */
    CancellationToken?: AbortSignal;
}

/** The probability at or above which a change is judged intended, unless configured. */
const DEFAULT_INTENDED_THRESHOLD = 0.5;

/** The questions one decision call carries, unless `maxQuestionsPerBatch` says otherwise. */
const DEFAULT_MAX_QUESTIONS_PER_CALL = 10;

/** The most characters of each reasoning or message field the decision state carries. */
const MAX_CONTEXT_TEXT = 4000;

/** The most removed key names listed for one change. */
const MAX_LISTED_KEYS = 10;

/**
 * Manages feedback collection for suspicious payload changes
 */
export class PayloadFeedbackManager {
    /**
     * The longest the decision call may take. Past it the call is aborted and every change is
     * accepted, as on any other failure. The same bound as the catalog narrowing decision.
     */
    public static readonly DECISION_TIMEOUT_MS = 30000;

    private config: PayloadFeedbackConfig;
    private decisionService: AgentDecisionService;
    private _lastDecisionResult: AIDecisionRunResult | undefined;

    /**
     * @param config - Feedback settings. See {@link PayloadFeedbackConfig}.
     * @param decisionService - Answers the questions in {@link QueryAgent}. Defaults to a new
     *   {@link AgentDecisionService}.
     */
    constructor(config?: PayloadFeedbackConfig, decisionService?: AgentDecisionService) {
        this.config = {
            maxQuestionsPerBatch: DEFAULT_MAX_QUESTIONS_PER_CALL,
            temperature: 0.1,
            intendedThreshold: DEFAULT_INTENDED_THRESHOLD,
            ...config
        };
        this.decisionService = decisionService ?? new AgentDecisionService();
    }

    /**
     * The probability at or above which a change is judged intended: `intendedThreshold`, or 0.5
     * when that is not a number from 0 to 1.
     */
    public get IntendedThreshold(): number {
        const threshold = this.config.intendedThreshold;
        return typeof threshold === 'number' && threshold >= 0 && threshold <= 1 ? threshold : DEFAULT_INTENDED_THRESHOLD;
    }

    /**
     * The result of the most recent decision call {@link QueryAgent} made, so the caller can link
     * its prompt run to a run step and count its cost. Undefined until a call is made.
     */
    public get LastDecisionResult(): AIDecisionRunResult | undefined {
        return this._lastDecisionResult;
    }

    /**
     * Generate feedback questions from warnings
     */
    public GenerateQuestions(warnings: PayloadWarning[]): PayloadFeedbackQuestion[] {
        const questions: PayloadFeedbackQuestion[] = [];
        const feedbackWarnings = warnings.filter(w => w.requiresFeedback);
        
        for (let i = 0; i < feedbackWarnings.length; i++) {
            const warning = feedbackWarnings[i];
            const question = this.createQuestionFromWarning(warning, i);
            questions.push(question);
        }
        
        return questions;
    }

    /** @deprecated Use {@link GenerateQuestions}. */
    public generateQuestions(warnings: PayloadWarning[]): PayloadFeedbackQuestion[] {
        return this.GenerateQuestions(warnings);
    }
    
    /**
     * Create a structured question from a warning
     */
    private createQuestionFromWarning(warning: PayloadWarning, index: number): PayloadFeedbackQuestion {
        let question = '';
        
        switch (warning.type) {
            case 'content_truncation':
                const truncDetails = warning.details as { originalLength: number; newLength: number; reductionPercentage: number };
                question = `Did you intend to reduce the content at "${warning.path}" from ${truncDetails.originalLength} to ${truncDetails.newLength} characters (${truncDetails.reductionPercentage.toFixed(1)}% reduction)?`;
                break;
                
            case 'key_removal':
                const removalDetails = warning.details as { removedKeys: string[] };
                question = `Did you intend to remove the non-empty key(s) at "${warning.path}": ${removalDetails.removedKeys.join(', ')}?`;
                break;
                
            case 'type_change':
                const typeDetails = warning.details as { originalType: string; newType: string };
                question = `Did you intend to change the type at "${warning.path}" from ${typeDetails.originalType} to ${typeDetails.newType}?`;
                break;
                
            case 'pattern_anomaly':
                question = `Did you intend the following change at "${warning.path}": ${warning.message}?`;
                break;
                
            default:
                question = `Did you intend the change at "${warning.path}": ${warning.message}?`;
        }
        
        return {
            id: `feedback_${index}_${Date.now()}`,
            question,
            warning,
            context: {
                path: warning.path,
                changeType: warning.type,
                details: warning.details
            }
        };
    }
    
    /**
     * Asks whether each suspicious payload change was intended: one Likelihood per question, all
     * in one decision call. The state is the agent's reasoning and message for the step plus a
     * compact list of the changes (paths, and sizes or types), never the payload itself.
     *
     * A change is `intended` when its probability is at or above {@link IntendedThreshold}, and
     * its explanation carries the probability. When no decision answers a change (no context user,
     * a failed, throwing, cancelled or timed-out call, a missing answer, or more questions than one
     * call carries), the change is accepted, as it always was, and its explanation says why. Never
     * throws.
     *
     * @param questions - The questions from {@link GenerateQuestions}
     * @param context - The agent's reasoning and message for the step, and the call's options
     * @param contextUser - The user the decision runs as
     * @returns One response per question, in the same order
     */
    public async QueryAgent(
        questions: PayloadFeedbackQuestion[],
        context: PayloadFeedbackContext,
        contextUser?: UserInfo
    ): Promise<PayloadFeedbackResponse[]> {
        if (questions.length === 0) {
            return [];
        }
        if (!contextUser) {
            return questions.map(q => this.acceptedByDefault(q, 'no context user for the decision call'));
        }

        const asked = questions.slice(0, this.maxQuestionsPerCall());
        const result = await this.askDecisions(asked, context ?? {}, contextUser);
        this._lastDecisionResult = result;
        if (!result.success) {
            const reason = result.errorMessage || 'no error message';
            LogError(`PayloadFeedbackManager: the payload change decisions failed, so every change is accepted: ${reason}`);
            return questions.map(q => this.acceptedByDefault(q, `the decision call failed: ${reason}`));
        }

        return questions.map((question, i) => i < asked.length
            ? this.mapAnswerToFeedback(question, result.Answers[this.questionKey(i)])
            : this.acceptedByDefault(question, `over the limit of ${asked.length} questions per decision call`));
    }

    /** @deprecated Use {@link QueryAgent}. */
    public async queryAgent(
        questions: PayloadFeedbackQuestion[],
        context: PayloadFeedbackContext,
        contextUser?: UserInfo
    ): Promise<PayloadFeedbackResponse[]> {
        return this.QueryAgent(questions, context, contextUser);
    }

    /**
     * Describes one flagged change in a line: what the analyzer saw, where, and the names of any
     * removed keys. The analyzer's message carries the sizes or types, never payload content.
     */
    public DescribeChange(warning: PayloadWarning): string {
        const where = warning.path ? `"${warning.path}"` : 'the payload root';
        const keys = this.removedKeyNames(warning);
        const removed = keys.length > 0 ? ` (removed: ${keys.join(', ')})` : '';
        return `${warning.message} at ${where}${removed}`;
    }

    /**
     * The message that lists the changes judged unintended and asks the agent to confirm or restore
     * them, or `undefined` when every change was judged intended. It reverts nothing itself.
     */
    public BuildUnintendedChangesMessage(
        questions: PayloadFeedbackQuestion[],
        responses: PayloadFeedbackResponse[]
    ): string | undefined {
        const lines: string[] = [];
        for (const response of responses) {
            const question = questions.find(q => q.id === response.questionId);
            if (question && !response.intended) {
                const probability = typeof response.probability === 'number'
                    ? ` (probability it was intended: ${response.probability.toFixed(2)})`
                    : '';
                lines.push(`- ${this.DescribeChange(question.warning)}${probability}`);
            }
        }
        if (lines.length === 0) {
            return undefined;
        }
        return [
            'Payload change check: these changes to the payload may not have been intended.',
            ...lines,
            'Nothing was reverted. If you meant a change, confirm it in your reasoning and carry on. If not, restore the original value with a payloadChangeRequest.'
        ].join('\n');
    }

    /**
     * Asks the questions in one call. Never throws, and never waits longer than
     * {@link PayloadFeedbackManager.DECISION_TIMEOUT_MS} or past the run's cancellation: a throw, a
     * timeout and a cancelled run each come back as a failed result, so the caller accepts every
     * change. Stopping also aborts the call.
     */
    private async askDecisions(
        questions: PayloadFeedbackQuestion[],
        context: PayloadFeedbackContext,
        contextUser: UserInfo
    ): Promise<AIDecisionRunResult> {
        const runToken = context.CancellationToken;
        if (runToken?.aborted) {
            return this.failedResult('the run was cancelled');
        }
        const controller = new AbortController();
        let stop: (reason: string) => void = () => undefined;
        const stopped = new Promise<AIDecisionRunResult>(resolve => {
            stop = (reason: string): void => {
                controller.abort(reason);
                resolve(this.failedResult(reason));
            };
        });
        const relayRunAbort = (): void => stop('the run was cancelled');
        runToken?.addEventListener('abort', relayRunAbort, { once: true });
        const timeoutMS = PayloadFeedbackManager.DECISION_TIMEOUT_MS;
        const timer = setTimeout(() => stop(`timed out after ${timeoutMS} ms`), timeoutMS);
        try {
            const ask = this.decisionService.Ask({
                State: this.buildDecisionState(questions, context),
                Questions: this.buildDecisionQuestions(questions),
                ContextUser: contextUser,
                AgentID: context.AgentID,
                PromptName: this.config.decisionPromptName,
                CancellationToken: controller.signal
            });
            return await Promise.race([ask, stopped]);
        } catch (error) {
            return this.failedResult(error instanceof Error ? error.message : String(error));
        } finally {
            clearTimeout(timer);
            runToken?.removeEventListener('abort', relayRunAbort);
        }
    }

    /** A decision result that answered nothing, and why. */
    private failedResult(errorMessage: string): AIDecisionRunResult {
        return { success: false, errorMessage, Answers: {} };
    }

    /** One Likelihood per question: "Given the agent's stated reasoning, this change was intended: ...". */
    private buildDecisionQuestions(questions: PayloadFeedbackQuestion[]): Record<string, DecisionQuestion> {
        const result: Record<string, DecisionQuestion> = {};
        questions.forEach((question, i) => {
            result[this.questionKey(i)] = {
                Kind: 'Likelihood',
                Instructions: `Given the agent's stated reasoning, this change was intended: ${this.DescribeChange(question.warning)}`
            };
        });
        return result;
    }

    /** The agent's reasoning and message, then the numbered changes. Never the payload. */
    private buildDecisionState(questions: PayloadFeedbackQuestion[], context: PayloadFeedbackContext): string {
        const sections = [
            this.contextSection("The agent's reasoning for this step", context.Reasoning),
            this.contextSection("The agent's reasoning for the payload change", context.ChangeReasoning),
            this.contextSection("The agent's message", context.Message)
        ].filter((section): section is string => section !== undefined);
        if (sections.length === 0) {
            sections.push('The agent gave no reasoning or message for this step.');
        }
        const changes = questions.map((q, i) => `${i + 1}. ${this.DescribeChange(q.warning)}`);
        sections.push(`The payload changes in question (paths, and sizes or types):\n${changes.join('\n')}`);
        return sections.join('\n\n');
    }

    /** A labelled, capped block of the agent's text, or `undefined` when there is none. */
    private contextSection(label: string, text: string | undefined): string | undefined {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        return trimmed ? `${label}:\n${trimmed.slice(0, MAX_CONTEXT_TEXT)}` : undefined;
    }

    /** The key names a key-removal warning recorded, if any. */
    private removedKeyNames(warning: PayloadWarning): string[] {
        const details: unknown = warning.details;
        if (typeof details !== 'object' || details === null || !('removedKeys' in details) || !Array.isArray(details.removedKeys)) {
            return [];
        }
        const keys: unknown[] = details.removedKeys;
        return keys.filter((key): key is string => typeof key === 'string').slice(0, MAX_LISTED_KEYS);
    }

    /** Maps one answer to the feedback shape. Anything but a numeric Likelihood is accepted by default. */
    private mapAnswerToFeedback(question: PayloadFeedbackQuestion, answer: DecisionAnswer | undefined): PayloadFeedbackResponse {
        if (answer?.Kind !== 'Likelihood' || !Number.isFinite(answer.Probability)) {
            return this.acceptedByDefault(question, 'no usable answer for this change');
        }
        const threshold = this.IntendedThreshold;
        return {
            questionId: question.id,
            intended: answer.Probability >= threshold,
            probability: answer.Probability,
            explanation: `Probability the change was intended: ${answer.Probability.toFixed(2)} (threshold ${threshold})`
        };
    }

    /** Accepts the change, as it always was, and says why. */
    private acceptedByDefault(question: PayloadFeedbackQuestion, reason: string): PayloadFeedbackResponse {
        return {
            questionId: question.id,
            intended: true,
            explanation: `Accepted by default (${reason})`
        };
    }

    /** The question key for position `index`. Keys are labels for code; the model reads the instructions. */
    private questionKey(index: number): string {
        return `change_${index + 1}`;
    }

    /** `maxQuestionsPerBatch`, or 10 when that is not a positive whole number. */
    private maxQuestionsPerCall(): number {
        const max = this.config.maxQuestionsPerBatch;
        return typeof max === 'number' && Number.isInteger(max) && max > 0 ? max : DEFAULT_MAX_QUESTIONS_PER_CALL;
    }

    /**
     * Process feedback responses and determine final result
     */
    public ProcessFeedback(
        questions: PayloadFeedbackQuestion[],
        responses: PayloadFeedbackResponse[]
    ): PayloadFeedbackResult {
        const acceptedChanges: string[] = [];
        const rejectedChanges: string[] = [];
        
        for (const response of responses) {
            const question = questions.find(q => q.id === response.questionId);
            if (question) {
                if (response.intended) {
                    acceptedChanges.push(question.warning.path);
                } else {
                    rejectedChanges.push(question.warning.path);
                }
            }
        }
        
        return {
            questions,
            responses,
            acceptedChanges,
            rejectedChanges,
            requiresRevision: rejectedChanges.length > 0
        };
    }

    /** @deprecated Use {@link ProcessFeedback}. */
    public processFeedback(
        questions: PayloadFeedbackQuestion[],
        responses: PayloadFeedbackResponse[]
    ): PayloadFeedbackResult {
        return this.ProcessFeedback(questions, responses);
    }
    
    /**
     * Log feedback results
     */
    public LogFeedbackResults(result: PayloadFeedbackResult): void {
        if (result.responses.length === 0) {
            return;
        }
        
        LogStatus(`\n📋 Payload Change Feedback Results:`);
        LogStatus(`   ✅ Accepted changes: ${result.acceptedChanges.length}`);
        LogStatus(`   ❌ Rejected changes: ${result.rejectedChanges.length}`);
        
        if (result.rejectedChanges.length > 0) {
            LogStatus(`\n   Rejected change paths:`);
            for (const path of result.rejectedChanges) {
                LogStatus(`      - ${path}`);
            }
        }
        
        if (result.requiresRevision) {
            LogStatus(`\n   ⚠️  Agent needs to revise the payload`);
        }
    }

    /** @deprecated Use {@link LogFeedbackResults}. */
    public logFeedbackResults(result: PayloadFeedbackResult): void {
        return this.LogFeedbackResults(result);
    }
}