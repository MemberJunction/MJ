/**
 * Unit tests for AIPromptRunner credential error handling.
 *
 * These tests verify that when no API credentials are configured for any
 * model-vendor combination, the error is properly classified, descriptive
 * error messages are generated, and errorInfo is attached to the ChatResult
 * so downstream consumers (e.g., isFatalPromptError) can detect fatal errors.
 *
 * @since 5.6.0 (credential error classification fix)
 *
 * The message builder used to be a private method on AIPromptRunner and was RE-IMPLEMENTED in
 * this file, so these tests asserted against a copy: the production method could change freely
 * and they would stay green. It now lives in `../no-model-found-message` and is imported here,
 * which is what makes the driver-class summary below real coverage.
 */

import { describe, it, expect } from 'vitest';
import { AIErrorInfo, AIErrorType, ErrorSeverity, ErrorAnalyzer } from '@memberjunction/ai';
import { buildNoModelFoundMessage, NOT_EVALUATED_REASON } from '../no-model-found-message';

// ============================================================================
// Mock Types
// ============================================================================

/**
 * Mock model entity for selection info
 */
interface MockModel {
    ID: string;
    Name: string;
}

/**
 * Mock vendor entity for selection info
 */
interface MockVendor {
    ID: string;
    Name: string;
}

/**
 * Mock AIModelSelectionInfo structure. Only the fields the message reads are needed —
 * `NoModelFoundSelectionInfo` is structural for exactly this reason.
 */
interface MockSelectionInfo {
    modelsConsidered: Array<{
        model: MockModel;
        vendor?: MockVendor;
        priority: number;
        available: boolean;
        unavailableReason?: string;
        driverClass?: string;
    }>;
    selectionReason: string;
}

// ============================================================================
// Tests
// ============================================================================

describe('AIPromptRunner Credential Error Handling', () => {
    describe('buildNoModelFoundMessage', () => {
        it('should produce a descriptive message when all models lack credentials', () => {
            const selectionInfo: MockSelectionInfo = {
                modelsConsidered: [
                    {
                        model: { ID: 'm1', Name: 'GPT-OSS-120B' },
                        vendor: { ID: 'v1', Name: 'Cerebras' },
                        priority: 1,
                        available: false,
                        unavailableReason: 'No credentials configured for driver CerebrasLLM'
                    },
                    {
                        model: { ID: 'm2', Name: 'GPT-OSS-120B' },
                        vendor: { ID: 'v2', Name: 'Groq' },
                        priority: 2,
                        available: false,
                        unavailableReason: 'No credentials configured for driver GroqLLM'
                    },
                    {
                        model: { ID: 'm3', Name: 'GPT 4.1-mini' },
                        vendor: { ID: 'v3', Name: 'OpenAI' },
                        priority: 3,
                        available: false,
                        unavailableReason: 'No credentials configured for driver OpenAILLM'
                    }
                ],
                selectionReason: 'No API keys found for any model-vendor combination'
            };

            const message = buildNoModelFoundMessage('Sage - System Prompt', selectionInfo);

            expect(message).toContain('No suitable model found');
            expect(message).toContain('Sage - System Prompt');
            expect(message).toContain('No valid API credentials/keys');
            expect(message).toContain('GPT-OSS-120B/Cerebras');
            expect(message).toContain('GPT-OSS-120B/Groq');
            expect(message).toContain('GPT 4.1-mini/OpenAI');
            expect(message).toContain('Please configure API credentials');
        });

        it('should handle empty modelsConsidered list', () => {
            const selectionInfo: MockSelectionInfo = {
                modelsConsidered: [],
                selectionReason: 'No suitable model candidates found'
            };

            const message = buildNoModelFoundMessage('My Prompt', selectionInfo);

            expect(message).toContain('No suitable model found');
            expect(message).toContain('No model-vendor candidates were available');
            expect(message).toContain('Please ensure AI models are configured');
        });

        it('should handle undefined selectionInfo', () => {
            const message = buildNoModelFoundMessage('My Prompt', undefined);

            expect(message).toContain('No suitable model found');
            expect(message).toContain('No model-vendor candidates were available');
        });

        it('should use selectionReason when some models are available but selection still fails', () => {
            const selectionInfo: MockSelectionInfo = {
                modelsConsidered: [
                    {
                        model: { ID: 'm1', Name: 'GPT-4' },
                        vendor: { ID: 'v1', Name: 'OpenAI' },
                        priority: 1,
                        available: true
                    },
                    {
                        model: { ID: 'm2', Name: 'Claude' },
                        vendor: { ID: 'v2', Name: 'Anthropic' },
                        priority: 2,
                        available: false,
                        unavailableReason: 'No credentials configured'
                    }
                ],
                selectionReason: 'Model filtered out by configuration constraints'
            };

            const message = buildNoModelFoundMessage('Test Prompt', selectionInfo);

            // Should use the selectionReason since not ALL models are unavailable
            expect(message).toContain('Model filtered out by configuration constraints');
            expect(message).not.toContain('No valid API credentials/keys');
        });

        it('should truncate model list when more than 5 candidates', () => {
            const models = Array.from({ length: 7 }, (_, i) => ({
                model: { ID: `m${i}`, Name: `Model-${i}` },
                vendor: { ID: `v${i}`, Name: `Vendor-${i}` },
                priority: i,
                available: false,
                unavailableReason: 'No credentials'
            }));

            const selectionInfo: MockSelectionInfo = {
                modelsConsidered: models,
                selectionReason: 'No API keys found'
            };

            const message = buildNoModelFoundMessage('Test', selectionInfo);

            expect(message).toContain('Model-0/Vendor-0');
            expect(message).toContain('Model-4/Vendor-4');
            expect(message).not.toContain('Model-5/Vendor-5');
            expect(message).toContain('(7 total)');
        });

        it('should use "default" when vendor is undefined', () => {
            const selectionInfo: MockSelectionInfo = {
                modelsConsidered: [
                    {
                        model: { ID: 'm1', Name: 'GPT-4' },
                        vendor: undefined,
                        priority: 1,
                        available: false,
                        unavailableReason: 'No credentials configured'
                    }
                ],
                selectionReason: 'No API keys found'
            };

            const message = buildNoModelFoundMessage('Prompt', selectionInfo);

            expect(message).toContain('GPT-4/default');
        });
    });

    describe('ErrorAnalyzer integration with credential errors', () => {
        it('should classify the built error message as NoCredentials via ErrorAnalyzer', () => {
            // Simulate what happens in ExecutePrompt's catch block:
            // 1. buildNoModelFoundMessage creates the error message
            // 2. ErrorAnalyzer.analyzeError classifies it
            const errorMessage = buildNoModelFoundMessage('System Prompt', {
                modelsConsidered: [
                    {
                        model: { ID: 'm1', Name: 'GPT-4' },
                        vendor: { ID: 'v1', Name: 'OpenAI' },
                        priority: 1,
                        available: false,
                        unavailableReason: 'No credentials'
                    }
                ],
                selectionReason: 'No API keys found'
            });

            const error = new Error(errorMessage);
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'AIPromptRunner');

            expect(errorInfo.errorType).toBe('NoCredentials');
            expect(errorInfo.severity).toBe('Fatal');
            expect(errorInfo.canFailover).toBe(false);
        });

        it('should classify errors from empty model list as NoCredentials', () => {
            const errorMessage = buildNoModelFoundMessage('Test Prompt', undefined);
            const error = new Error(errorMessage);
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'AIPromptRunner');

            expect(errorInfo.errorType).toBe('NoCredentials');
            expect(errorInfo.severity).toBe('Fatal');
        });
    });
});

// ============================================================================
// The driver-class summary.
//
// A candidate count on its own misleads. A tenant running on platform credits has one metered
// provider in front of every model, so its failure reads "101 candidates" — which looks like a
// badly configured chain and sends an operator to rebuild it, when all 101 rows are one driver
// class with no key and the fix is delivering that key.
// ============================================================================
describe('buildNoModelFoundMessage — naming the provider implementations', () => {
    /** The observed shape: one driver class repeated across a long candidate list, no key. */
    function platformCreditTenant(rows: number): MockSelectionInfo {
        return {
            modelsConsidered: Array.from({ length: rows }, (_, i) => ({
                model: { ID: `m${i}`, Name: `Model ${i}` },
                vendor: { ID: 'v-or', Name: 'OpenRouter' },
                priority: 100 - i,
                available: false,
                driverClass: 'OpenRouterLLM',
                unavailableReason: 'No credentials configured for driver OpenRouterLLM'
            })),
            selectionReason: 'No API keys found for any model-vendor combination'
        };
    }

    it('collapses a long one-provider list to the fact that actually explains it', () => {
        const message = buildNoModelFoundMessage('DbAutoDoc - Describe Table', platformCreditTenant(101));

        expect(message).toContain('101 candidates over 1 driver class (OpenRouterLLM)');
        expect(message).toContain('credentialed: none');
    });

    it('names which classes DO hold credentials when some do', () => {
        // The mixed case: the message must not read as "no keys anywhere" when one provider is
        // keyed and simply lost on priority or was filtered out.
        const selectionInfo: MockSelectionInfo = {
            modelsConsidered: [
                { model: { ID: 'm1', Name: 'GPT-4' }, vendor: { ID: 'v1', Name: 'OpenAI' }, priority: 100, available: true, driverClass: 'OpenAILLM' },
                { model: { ID: 'm2', Name: 'Claude' }, vendor: { ID: 'v2', Name: 'Anthropic' }, priority: 90, available: false, driverClass: 'AnthropicLLM' }
            ],
            selectionReason: 'Model filtered out by configuration constraints'
        };

        const message = buildNoModelFoundMessage('Test Prompt', selectionInfo);

        expect(message).toContain('2 candidates over 2 driver classes (OpenAILLM, AnthropicLLM)');
        expect(message).toContain('credentialed: OpenAILLM');
    });

    it('says how many candidates were never probed, so "none" is not over-read', () => {
        // Selection stops credential-probing once a candidate is chosen, so the tail carries
        // available:false without anyone having looked. Reporting that as "credentialed: none"
        // with nothing else said would be a false negative about a provider that may well have
        // a key.
        const selectionInfo: MockSelectionInfo = {
            modelsConsidered: [
                { model: { ID: 'm1', Name: 'GPT-4' }, vendor: { ID: 'v1', Name: 'OpenAI' }, priority: 100, available: false, driverClass: 'OpenAILLM', unavailableReason: 'No credentials configured for driver OpenAILLM' },
                { model: { ID: 'm2', Name: 'Claude' }, vendor: { ID: 'v2', Name: 'Anthropic' }, priority: 90, available: false, driverClass: 'AnthropicLLM', unavailableReason: NOT_EVALUATED_REASON }
            ],
            selectionReason: 'No API keys found'
        };

        const message = buildNoModelFoundMessage('Test Prompt', selectionInfo);

        expect(message).toContain('credentialed: none (1 not probed)');
    });

    it('truncates a genuinely wide spread instead of printing every class', () => {
        const classes = ['OpenAILLM', 'AnthropicLLM', 'GroqLLM', 'MistralLLM', 'CohereLLM'];
        const selectionInfo: MockSelectionInfo = {
            modelsConsidered: classes.map((driverClass, i) => ({
                model: { ID: `m${i}`, Name: `Model ${i}` },
                vendor: { ID: `v${i}`, Name: `Vendor ${i}` },
                priority: 100 - i,
                available: false,
                driverClass
            })),
            selectionReason: 'No API keys found'
        };

        const message = buildNoModelFoundMessage('Test Prompt', selectionInfo);

        expect(message).toContain('(OpenAILLM, AnthropicLLM, GroqLLM, +2 more)');
        expect(message).not.toContain('CohereLLM');
    });

    it('adds nothing at all when no candidate recorded a driver class', () => {
        // Back-compat pin. Callers that do not record one — and every stored message written
        // before this shipped — must read exactly as they did.
        const selectionInfo: MockSelectionInfo = {
            modelsConsidered: [
                { model: { ID: 'm1', Name: 'GPT-4' }, vendor: { ID: 'v1', Name: 'OpenAI' }, priority: 100, available: false }
            ],
            selectionReason: 'No API keys found'
        };

        const message = buildNoModelFoundMessage('Test Prompt', selectionInfo);

        expect(message).not.toContain('driver class');
        expect(message).toContain('Tried: GPT-4/OpenAI.');
        expect(message).toContain('Please configure API credentials');
    });
});
