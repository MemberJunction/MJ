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

import { LogStatus } from '@memberjunction/core';
import { ChatMessage } from '@memberjunction/ai';
import { PayloadWarning } from './PayloadChangeAnalyzer';

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
 * Interface for executing prompts - can be implemented by different prompt runners
 */
export interface IPromptExecutor {
    executePrompt(messages: ChatMessage[], options: any): Promise<string>;
}

/**
 * Manages feedback collection for suspicious payload changes
 */
export class PayloadFeedbackManager {
    private promptExecutor?: IPromptExecutor;
    
    constructor(promptExecutor?: IPromptExecutor) {
        this.promptExecutor = promptExecutor;
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
                question = `Did you intend to reduce the content at "${warning.path}" from ${warning.details.originalLength} to ${warning.details.newLength} characters (${warning.details.reductionPercentage.toFixed(1)}% reduction)?`;
                break;
                
            case 'key_removal':
                question = `Did you intend to remove the non-empty key(s) at "${warning.path}": ${warning.details.removedKeys.join(', ')}?`;
                break;
                
            case 'type_change':
                question = `Did you intend to change the type at "${warning.path}" from ${warning.details.originalType} to ${warning.details.newType}?`;
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
     * Query the AI agent about suspicious changes
     */
    public async queryAgent(
        questions: PayloadFeedbackQuestion[],
        conversationContext: any
    ): Promise<PayloadFeedbackResponse[]> {
        if (questions.length === 0) {
            return [];
        }
        
        // Build the feedback prompt
        const prompt = this.buildFeedbackPrompt(questions);
        
        try {
            // Query the AI agent using the provided executor or return mock response
            let response: string;
            
            if (this.promptExecutor) {
                const messages: ChatMessage[] = [
                    { role: 'system', content: this.getSystemPrompt() },
                    { role: 'user', content: prompt }
                ];
                
                response = await this.promptExecutor.executePrompt(messages, {
                    model: conversationContext.model,
                    temperature: 0.1,
                    maxTokens: 1000
                });
            } else {
                // If no executor provided, return default acceptance
                LogStatus('No prompt executor provided, accepting all changes by default');
                const mockResponses = questions.map((_, i) => ({
                    questionNumber: i + 1,
                    intended: true,
                    explanation: 'Accepted by default (no executor available)'
                }));
                response = `\`\`\`json\n${JSON.stringify({ responses: mockResponses }, null, 2)}\n\`\`\``;
            }
            
            // Parse the response
            const responses = this.parseAgentResponse(response, questions);
            
            return responses;
        } catch (error) {
            LogStatus(`Error querying agent for feedback: ${error.message}`);
            // Return default acceptance for all questions on error
            return questions.map(q => ({
                questionId: q.id,
                intended: true,
                explanation: 'Accepted due to feedback query error'
            }));
        }
    }
    
    /**
     * Build the feedback prompt
     */
    private buildFeedbackPrompt(questions: PayloadFeedbackQuestion[]): string {
        const lines = [
            'I noticed some potentially significant changes in your response that I want to confirm were intentional:',
            '',
            'Please answer each question with YES or NO, followed by a brief explanation if needed.',
            ''
        ];
        
        for (let i = 0; i < questions.length; i++) {
            lines.push(`${i + 1}. ${questions[i].question}`);
            
            // Add context if available
            if (questions[i].context?.details) {
                const details = questions[i].context.details;
                if (details.contentPreview) {
                    lines.push(`   Before: "${details.contentPreview.before}"`);
                    lines.push(`   After: "${details.contentPreview.after}"`);
                }
            }
            lines.push('');
        }
        
        lines.push('Please respond in the following JSON format:');
        lines.push('```json');
        lines.push('{');
        lines.push('  "responses": [');
        lines.push('    {');
        lines.push('      "questionNumber": 1,');
        lines.push('      "intended": true,');
        lines.push('      "explanation": "Brief explanation (optional)"');
        lines.push('    }');
        lines.push('  ]');
        lines.push('}');
        lines.push('```');
        
        return lines.join('\n');
    }
    
    /**
     * Get the system prompt for feedback queries
     */
    private getSystemPrompt(): string {
        return `You are reviewing changes you previously made to a data payload. 
Please confirm whether each change was intentional. 
Respond with structured JSON containing your yes/no answers. 
Be concise and direct in your responses.`;
    }
    
    /**
     * Parse the agent's response
     */
    private parseAgentResponse(
        response: string,
        questions: PayloadFeedbackQuestion[]
    ): PayloadFeedbackResponse[] {
        try {
            // Extract JSON from the response
            const jsonMatch = response.match(/```json\s*({[\s\S]*?})\s*```/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            
            const parsed = JSON.parse(jsonMatch[1]);
            const responses: PayloadFeedbackResponse[] = [];
            
            if (parsed.responses && Array.isArray(parsed.responses)) {
                for (const resp of parsed.responses) {
                    const questionIndex = resp.questionNumber - 1;
                    if (questionIndex >= 0 && questionIndex < questions.length) {
                        responses.push({
                            questionId: questions[questionIndex].id,
                            intended: Boolean(resp.intended),
                            explanation: resp.explanation
                        });
                    }
                }
            }
            
            // Fill in any missing responses with defaults
            for (const question of questions) {
                if (!responses.find(r => r.questionId === question.id)) {
                    responses.push({
                        questionId: question.id,
                        intended: true,
                        explanation: 'No explicit response provided'
                    });
                }
            }
            
            return responses;
        } catch (error) {
            LogStatus(`Error parsing agent feedback response: ${error.message}`);
            // Return default acceptance for all questions
            return questions.map(q => ({
                questionId: q.id,
                intended: true,
                explanation: 'Accepted due to parsing error'
            }));
        }
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