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
import { PayloadWarning } from './PayloadChangeAnalyzer';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';

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
}

/**
 * Manages feedback collection for suspicious payload changes
 */
export class PayloadFeedbackManager {
    private config: PayloadFeedbackConfig;
    
    constructor(config?: PayloadFeedbackConfig) {
        this.config = {
            maxQuestionsPerBatch: 10,
            temperature: 0.1,
            ...config
        };
    }
    
    /**
     * Generate feedback questions from warnings
     */
    public generateQuestions(warnings: PayloadWarning[]): PayloadFeedbackQuestion[] {
        const questions: PayloadFeedbackQuestion[] = [];
        const feedbackWarnings = warnings.filter(w => w.requiresFeedback);
        
        for (let i = 0; i < feedbackWarnings.length; i++) {
            const warning = feedbackWarnings[i];
            const question = this.createQuestionFromWarning(warning, i);
            questions.push(question);
        }
        
        return questions;
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
     * Query the AI agent about suspicious changes using MemberJunction AI Prompts system.
     *
     * @param questions - Array of feedback questions to ask about payload changes
     * @param conversationContext - Context from the conversation (for reference)
     * @param contextUser - User context for the prompt execution
     * @returns Array of responses indicating whether each change was intended
     */
    public async queryAgent(
        questions: PayloadFeedbackQuestion[],
        conversationContext: Record<string, unknown>,
        contextUser?: UserInfo
    ): Promise<PayloadFeedbackResponse[]> {
        if (questions.length === 0) {
            return [];
        }

        // Find the payload feedback prompt
        const promptName = 'Payload Change Feedback Query';
        const prompt = AIEngine.Instance.Prompts.find(
            p => p.Name.trim().toLowerCase() === promptName.toLowerCase() &&
                 p.Category?.trim().toLowerCase() === 'mj: system'
        );

        if (!prompt) {
            // Fallback: accept all changes if prompt not configured
            LogStatus(`PayloadFeedbackManager: Prompt "${promptName}" not found in MJ: System category. Accepting all changes by default.`);
            return questions.map(q => ({
                questionId: q.id,
                intended: true,
                explanation: 'Accepted by default (feedback prompt not configured)'
            }));
        }

        try {
            // Build template parameters
            const templateData = this.buildFeedbackTemplateParams(questions);

            // Execute the prompt
            const runner = new AIPromptRunner();
            const promptParams = new AIPromptParams();
            promptParams.prompt = prompt;
            promptParams.data = templateData;
            if (contextUser) {
                promptParams.contextUser = contextUser;
            }

            const result = await runner.ExecutePrompt<{ responses: Array<{ questionNumber: number; intended: boolean; explanation?: string }> }>(promptParams);

            if (!result.success || !result.result?.responses) {
                LogError('PayloadFeedbackManager: Failed to get valid response from feedback prompt', undefined, result.errorMessage);
                // Fallback to accepting all changes
                return questions.map(q => ({
                    questionId: q.id,
                    intended: true,
                    explanation: 'Accepted by default (prompt execution failed)'
                }));
            }

            // Map LLM responses back to our format
            return this.mapLLMResponsesToFeedback(questions, result.result.responses);
        } catch (error) {
            LogError('PayloadFeedbackManager: Error querying agent for feedback', undefined, error);
            // Fallback to accepting all changes
            return questions.map(q => ({
                questionId: q.id,
                intended: true,
                explanation: 'Accepted by default (error during feedback query)'
            }));
        }
    }

    /**
     * Map LLM responses back to PayloadFeedbackResponse format
     */
    private mapLLMResponsesToFeedback(
        questions: PayloadFeedbackQuestion[],
        llmResponses: Array<{ questionNumber: number; intended: boolean; explanation?: string }>
    ): PayloadFeedbackResponse[] {
        return questions.map((q, index) => {
            const questionNumber = index + 1;
            const llmResponse = llmResponses.find(r => r.questionNumber === questionNumber);

            if (llmResponse) {
                return {
                    questionId: q.id,
                    intended: llmResponse.intended,
                    explanation: llmResponse.explanation
                };
            }

            // Default to intended if no matching response found
            return {
                questionId: q.id,
                intended: true,
                explanation: 'No explicit response from LLM - assuming intended'
            };
        });
    }
    
    /**
     * Build template parameters for the feedback prompt
     * 
     * @todo This should prepare the data structure to pass to the stored prompt template
     */
    private buildFeedbackTemplateParams(questions: PayloadFeedbackQuestion[]): Record<string, any> {
        return {
            questions: questions.map((q, i) => ({
                number: i + 1,
                text: q.question,
                context: q.context,
                warningType: q.warning.type,
                severity: q.warning.severity
            })),
            totalQuestions: questions.length,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Process feedback responses and determine final result
     */
    public processFeedback(
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
    
    /**
     * Log feedback results
     */
    public logFeedbackResults(result: PayloadFeedbackResult): void {
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
}