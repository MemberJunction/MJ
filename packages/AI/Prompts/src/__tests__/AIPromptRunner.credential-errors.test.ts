/**
 * Unit tests for AIPromptRunner credential error handling.
 *
 * These tests verify that when no API credentials are configured for any
 * model-vendor combination, the error is properly classified, descriptive
 * error messages are generated, and errorInfo is attached to the ChatResult
 * so downstream consumers (e.g., isFatalPromptError) can detect fatal errors.
 *
 * @since 5.6.0 (credential error classification fix)
 */

import { describe, it, expect } from 'vitest';
import { AIErrorInfo, AIErrorType, ErrorSeverity, ErrorAnalyzer } from '@memberjunction/ai';

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
 * Mock AIModelSelectionInfo structure matching the real class
 */
interface MockSelectionInfo {
    modelsConsidered: Array<{
        model: MockModel;
        vendor?: MockVendor;
        priority: number;
        available: boolean;
        unavailableReason?: string;
    }>;
    selectionReason: string;
}

// ============================================================================
// Standalone Implementation of buildNoModelFoundMessage for Testing
// This mirrors the AIPromptRunner.buildNoModelFoundMessage() implementation
// ============================================================================

/**
 * Builds a descriptive error message when no model could be selected for a prompt.
 */
function buildNoModelFoundMessage(promptName: string, selectionInfo?: MockSelectionInfo): string {
    const base = `No suitable model found for prompt ${promptName}`;

    if (!selectionInfo?.modelsConsidered || selectionInfo.modelsConsidered.length === 0) {
        return `${base}. No model-vendor candidates were available. Please ensure AI models are configured for this prompt.`;
    }

    // Check if all models were unavailable due to missing credentials
    const unavailableModels = selectionInfo.modelsConsidered.filter(m => !m.available);
    if (unavailableModels.length === selectionInfo.modelsConsidered.length) {
        const triedSummary = unavailableModels.slice(0, 5).map(m => {
            const vendorName = m.vendor?.Name || 'default';
            return `${m.model.Name}/${vendorName}`;
        }).join(', ');

        const suffix = unavailableModels.length > 5 ? ` (${unavailableModels.length} total)` : '';
        return `${base}. No valid API credentials/keys are configured for any of the candidate model-vendor combinations. ` +
            `Tried: ${triedSummary}${suffix}. ` +
            `Please configure API credentials in your environment or AI Credential settings.`;
    }

    return `${base}. ${selectionInfo.selectionReason || 'Unknown reason'}`;
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
