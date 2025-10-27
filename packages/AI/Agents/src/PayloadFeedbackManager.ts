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

import { LogStatus } from '@memberjunction/global';
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
      ...config,
    };
  }

  /**
   * Generate feedback questions from warnings
   */
  public generateQuestions(warnings: PayloadWarning[]): PayloadFeedbackQuestion[] {
    const questions: PayloadFeedbackQuestion[] = [];
    const feedbackWarnings = warnings.filter((w) => w.requiresFeedback);

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
        details: warning.details,
      },
    };
  }

  /**
   * Query the AI agent about suspicious changes
   *
   * @todo Implement using MemberJunction AI Prompts system with stored prompts
   * This should:
   * 1. Load the feedback prompt from database using feedbackPromptId
   * 2. Use AIPromptRunner to execute with proper template parameters
   * 3. Parse structured response from the agent
   */
  public async queryAgent(questions: PayloadFeedbackQuestion[], conversationContext: any): Promise<PayloadFeedbackResponse[]> {
    if (questions.length === 0) {
      return [];
    }

    // TODO: Implement using MemberJunction prompt system
    // For now, return default acceptance
    LogStatus('PayloadFeedbackManager.queryAgent not yet implemented - accepting all changes by default');

    return questions.map((q) => ({
      questionId: q.id,
      intended: true,
      explanation: 'Accepted by default (feedback system not yet implemented)',
    }));
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
        severity: q.warning.severity,
      })),
      totalQuestions: questions.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Process feedback responses and determine final result
   */
  public processFeedback(questions: PayloadFeedbackQuestion[], responses: PayloadFeedbackResponse[]): PayloadFeedbackResult {
    const acceptedChanges: string[] = [];
    const rejectedChanges: string[] = [];

    for (const response of responses) {
      const question = questions.find((q) => q.id === response.questionId);
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
      requiresRevision: rejectedChanges.length > 0,
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
