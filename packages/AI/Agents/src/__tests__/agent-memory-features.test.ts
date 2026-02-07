/**
 * Unit tests for Agent Memory Features (Phase 1-3 improvements).
 *
 * These tests verify:
 * - PayloadFeedbackManager functionality
 * - AgentContextInjector formatting with precedence instructions
 * - Multi-tenant scope determination
 *
 * @since 2.130.0
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Mock Data and Types
// ============================================================================

interface MockNote {
    ID: string;
    Type: string;
    Note: string;
    AgentID: string | null;
    UserID: string | null;
    CompanyID: string | null;
    PrimaryScopeRecordID: string | null;
    SecondaryScopes: string | null;
    __mj_CreatedAt?: Date;
}

interface MockPayloadWarning {
    type: 'content_truncation' | 'key_removal' | 'type_change' | 'pattern_anomaly';
    path: string;
    message: string;
    severity: 'high' | 'medium' | 'low';
    details: Record<string, unknown>;
    requiresFeedback: boolean;
}

interface MockFeedbackQuestion {
    id: string;
    question: string;
    warning: MockPayloadWarning;
    context?: {
        path: string;
        changeType: string;
        details: unknown;
    };
}

// ============================================================================
// Test Helpers - Standalone implementations for testing
// ============================================================================

/**
 * Determine MJ scope description for a note (mirrors AgentContextInjector)
 */
function determineNoteScope(note: MockNote): string {
    if (note.AgentID && note.UserID && note.CompanyID) {
        return 'Agent + User + Company specific';
    }
    if (note.AgentID && note.UserID) {
        return 'Agent + User specific';
    }
    if (note.AgentID && note.CompanyID) {
        return 'Agent + Company specific';
    }
    if (note.UserID && note.CompanyID) {
        return 'User + Company specific';
    }
    if (note.AgentID) {
        return 'Agent-specific';
    }
    if (note.UserID) {
        return 'User-specific';
    }
    if (note.CompanyID) {
        return 'Company-wide';
    }
    return 'Global';
}

/**
 * Determine SaaS scope description for a note (new multi-tenant feature)
 */
function determineSaaSScope(note: MockNote): string | null {
    if (!note.PrimaryScopeRecordID) {
        return null; // No SaaS scope
    }

    const hasSecondary = note.SecondaryScopes && note.SecondaryScopes !== '{}';

    if (hasSecondary) {
        return 'Contact-specific (most specific)';
    }

    return 'Organization-level';
}

/**
 * Format notes for injection with optional memory policy (mirrors AgentContextInjector)
 */
function formatNotesForInjection(notes: MockNote[], includeMemoryPolicy: boolean = true): string {
    if (notes.length === 0) return '';

    const lines: string[] = [];

    if (includeMemoryPolicy) {
        lines.push('<memory_policy>');
        lines.push('Precedence (highest to lowest):');
        lines.push('1) Current user message overrides all stored memory');
        lines.push('2) Contact-specific notes override organization-level');
        lines.push('3) Organization notes override global defaults');
        lines.push('4) When same scope, prefer most recent by date');
        lines.push('');
        lines.push('Conflict resolution:');
        lines.push('- If two notes contradict, prefer the more specific scope');
        lines.push('- Ask clarifying question only if conflict materially affects response');
        lines.push('</memory_policy>');
        lines.push('');
    }

    lines.push(`\u{1F4DD} AGENT NOTES (${notes.length})`);
    lines.push('');

    for (const note of notes) {
        lines.push(`[${note.Type}] ${note.Note}`);

        const scope = determineNoteScope(note);
        const saasScope = determineSaaSScope(note);

        if (saasScope) {
            lines.push(`  Scope: ${saasScope}`);
        } else if (scope) {
            lines.push(`  Scope: ${scope}`);
        }

        lines.push('');
    }

    lines.push('---');
    return lines.join('\n');
}

/**
 * Generate feedback questions from warnings (mirrors PayloadFeedbackManager)
 */
function generateQuestions(warnings: MockPayloadWarning[]): MockFeedbackQuestion[] {
    const questions: MockFeedbackQuestion[] = [];
    const feedbackWarnings = warnings.filter(w => w.requiresFeedback);

    for (let i = 0; i < feedbackWarnings.length; i++) {
        const warning = feedbackWarnings[i];
        let question = '';

        switch (warning.type) {
            case 'content_truncation': {
                const truncDetails = warning.details as { originalLength: number; newLength: number; reductionPercentage: number };
                question = `Did you intend to reduce the content at "${warning.path}" from ${truncDetails.originalLength} to ${truncDetails.newLength} characters (${truncDetails.reductionPercentage.toFixed(1)}% reduction)?`;
                break;
            }

            case 'key_removal': {
                const removalDetails = warning.details as { removedKeys: string[] };
                question = `Did you intend to remove the non-empty key(s) at "${warning.path}": ${removalDetails.removedKeys.join(', ')}?`;
                break;
            }

            case 'type_change': {
                const typeDetails = warning.details as { originalType: string; newType: string };
                question = `Did you intend to change the type at "${warning.path}" from ${typeDetails.originalType} to ${typeDetails.newType}?`;
                break;
            }

            case 'pattern_anomaly':
                question = `Did you intend the following change at "${warning.path}": ${warning.message}?`;
                break;

            default:
                question = `Did you intend the change at "${warning.path}": ${warning.message}?`;
        }

        questions.push({
            id: `feedback_${i}_${Date.now()}`,
            question,
            warning,
            context: {
                path: warning.path,
                changeType: warning.type,
                details: warning.details
            }
        });
    }

    return questions;
}

/**
 * Map LLM responses to feedback format (mirrors PayloadFeedbackManager)
 */
function mapLLMResponsesToFeedback(
    questions: MockFeedbackQuestion[],
    llmResponses: Array<{ questionNumber: number; intended: boolean; explanation?: string }>
): Array<{ questionId: string; intended: boolean; explanation?: string }> {
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

        return {
            questionId: q.id,
            intended: true,
            explanation: 'No explicit response from LLM - assuming intended'
        };
    });
}

// ============================================================================
// Test Data
// ============================================================================

const mockNotes: MockNote[] = [
    {
        ID: 'note-1',
        Type: 'Preference',
        Note: 'User prefers bullet points',
        AgentID: 'agent-1',
        UserID: 'user-1',
        CompanyID: null,
        PrimaryScopeRecordID: null,
        SecondaryScopes: null
    },
    {
        ID: 'note-2',
        Type: 'Context',
        Note: 'Company uses metric units',
        AgentID: null,
        UserID: null,
        CompanyID: 'company-1',
        PrimaryScopeRecordID: 'org-123',
        SecondaryScopes: null
    },
    {
        ID: 'note-3',
        Type: 'Constraint',
        Note: 'Never share PII',
        AgentID: null,
        UserID: null,
        CompanyID: null,
        PrimaryScopeRecordID: null,
        SecondaryScopes: null
    },
    {
        ID: 'note-4',
        Type: 'Preference',
        Note: 'John prefers formal tone',
        AgentID: 'agent-1',
        UserID: null,
        CompanyID: null,
        PrimaryScopeRecordID: 'org-123',
        SecondaryScopes: '{"ContactID": "contact-456"}'
    }
];

const mockWarnings: MockPayloadWarning[] = [
    {
        type: 'content_truncation',
        path: 'response.body',
        message: 'Content was significantly reduced',
        severity: 'high',
        details: { originalLength: 1000, newLength: 100, reductionPercentage: 90 },
        requiresFeedback: true
    },
    {
        type: 'key_removal',
        path: 'data.metadata',
        message: 'Keys were removed',
        severity: 'medium',
        details: { removedKeys: ['timestamp', 'version'] },
        requiresFeedback: true
    },
    {
        type: 'type_change',
        path: 'config.enabled',
        message: 'Type changed',
        severity: 'low',
        details: { originalType: 'boolean', newType: 'string' },
        requiresFeedback: false // Should be filtered out
    }
];

// ============================================================================
// Scope Determination Tests
// ============================================================================

describe('Scope Determination', () => {
    it('determineNoteScope: Agent + User specific', () => {
        expect(determineNoteScope(mockNotes[0])).toBe('Agent + User specific');
    });

    it('determineNoteScope: Company-wide', () => {
        expect(determineNoteScope(mockNotes[1])).toBe('Company-wide');
    });

    it('determineNoteScope: Global (all null)', () => {
        expect(determineNoteScope(mockNotes[2])).toBe('Global');
    });

    it('determineSaaSScope: Organization-level (primary scope only)', () => {
        expect(determineSaaSScope(mockNotes[1])).toBe('Organization-level');
    });

    it('determineSaaSScope: Contact-specific (has secondary scopes)', () => {
        expect(determineSaaSScope(mockNotes[3])).toBe('Contact-specific (most specific)');
    });

    it('determineSaaSScope: null when no SaaS scope', () => {
        expect(determineSaaSScope(mockNotes[0])).toBeNull();
    });
});

// ============================================================================
// Format Notes Tests
// ============================================================================

describe('Format Notes', () => {
    it('includes memory policy by default', () => {
        const result = formatNotesForInjection(mockNotes);
        expect(result).toContain('<memory_policy>');
        expect(result).toContain('Precedence (highest to lowest)');
        expect(result).toContain('Contact-specific notes override organization-level');
        expect(result).toContain('</memory_policy>');
    });

    it('excludes memory policy when disabled', () => {
        const result = formatNotesForInjection(mockNotes, false);
        expect(result).not.toContain('<memory_policy>');
    });

    it('includes note count', () => {
        const result = formatNotesForInjection(mockNotes);
        expect(result).toContain(`AGENT NOTES (${mockNotes.length})`);
    });

    it('includes note types and content', () => {
        const result = formatNotesForInjection(mockNotes);
        expect(result).toContain('[Preference] User prefers bullet points');
        expect(result).toContain('[Context] Company uses metric units');
        expect(result).toContain('[Constraint] Never share PII');
    });

    it('shows SaaS scope when available', () => {
        const result = formatNotesForInjection(mockNotes);
        expect(result).toContain('Organization-level');
        expect(result).toContain('Contact-specific (most specific)');
    });

    it('returns empty string for empty notes', () => {
        expect(formatNotesForInjection([])).toBe('');
    });
});

// ============================================================================
// Feedback Question Tests
// ============================================================================

describe('Feedback Questions', () => {
    it('filters out non-feedback warnings', () => {
        const questions = generateQuestions(mockWarnings);
        expect(questions.length).toBe(2);
    });

    it('formats content_truncation correctly', () => {
        const questions = generateQuestions(mockWarnings);
        const truncQuestion = questions[0];
        expect(truncQuestion.question).toContain('reduce the content');
        expect(truncQuestion.question).toContain('1000 to 100');
        expect(truncQuestion.question).toContain('90.0%');
    });

    it('formats key_removal correctly', () => {
        const questions = generateQuestions(mockWarnings);
        const removalQuestion = questions[1];
        expect(removalQuestion.question).toContain('remove the non-empty key(s)');
        expect(removalQuestion.question).toContain('timestamp');
        expect(removalQuestion.question).toContain('version');
    });

    it('includes context with path and type', () => {
        const questions = generateQuestions(mockWarnings);
        const question = questions[0];
        expect(question.context).toBeDefined();
        expect(question.context?.path).toBe('response.body');
        expect(question.context?.changeType).toBe('content_truncation');
    });
});

// ============================================================================
// LLM Response Mapping Tests
// ============================================================================

describe('LLM Response Mapping', () => {
    it('maps responses correctly', () => {
        const questions = generateQuestions(mockWarnings);
        const llmResponses = [
            { questionNumber: 1, intended: false, explanation: 'This was a mistake' },
            { questionNumber: 2, intended: true, explanation: 'Intended cleanup' }
        ];

        const result = mapLLMResponsesToFeedback(questions, llmResponses);

        expect(result.length).toBe(2);
        expect(result[0].intended).toBe(false);
        expect(result[0].explanation).toBe('This was a mistake');
        expect(result[1].intended).toBe(true);
    });

    it('defaults to intended when no response', () => {
        const questions = generateQuestions(mockWarnings);
        const llmResponses: Array<{ questionNumber: number; intended: boolean; explanation?: string }> = [];

        const result = mapLLMResponsesToFeedback(questions, llmResponses);

        expect(result.every(r => r.intended === true)).toBe(true);
        expect(result[0].explanation).toContain('No explicit response');
    });
});

// ============================================================================
// Memory Cleanup Agent Tests
// ============================================================================

describe('Memory Cleanup Agent', () => {
    function getCutoffDate(retentionDays: number): string {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);
        return cutoff.toISOString();
    }

    function getNoteRetentionDays(agent: { NoteRetentionDays?: number | null }): number {
        const DEFAULT_NOTE_RETENTION_DAYS = 90;
        if (typeof agent.NoteRetentionDays === 'number' && agent.NoteRetentionDays > 0) {
            return agent.NoteRetentionDays;
        }
        return DEFAULT_NOTE_RETENTION_DAYS;
    }

    function getExampleRetentionDays(agent: { ExampleRetentionDays?: number | null }): number {
        const DEFAULT_EXAMPLE_RETENTION_DAYS = 180;
        if (typeof agent.ExampleRetentionDays === 'number' && agent.ExampleRetentionDays > 0) {
            return agent.ExampleRetentionDays;
        }
        return DEFAULT_EXAMPLE_RETENTION_DAYS;
    }

    function getAutoArchiveEnabled(agent: { AutoArchiveEnabled?: boolean }): boolean {
        return agent.AutoArchiveEnabled !== false;
    }

    function buildCleanupSummary(result: {
        notesArchived: number;
        examplesArchived: number;
        notesExpired: number;
        examplesExpired: number;
        errors: string[];
    }): string {
        const parts: string[] = [];
        if (result.notesArchived > 0) parts.push(`${result.notesArchived} stale notes archived`);
        if (result.examplesArchived > 0) parts.push(`${result.examplesArchived} stale examples archived`);
        if (result.notesExpired > 0) parts.push(`${result.notesExpired} expired notes archived`);
        if (result.examplesExpired > 0) parts.push(`${result.examplesExpired} expired examples archived`);
        if (parts.length === 0) parts.push('No items needed archiving');
        if (result.errors.length > 0) parts.push(`${result.errors.length} errors encountered`);
        return parts.join(', ');
    }

    it('getCutoffDate calculates correct date for 90 days', () => {
        const now = new Date();
        const cutoffStr = getCutoffDate(90);
        const cutoffDate = new Date(cutoffStr);
        const expectedDate = new Date(now);
        expectedDate.setDate(expectedDate.getDate() - 90);
        const diff = Math.abs(cutoffDate.getTime() - expectedDate.getTime());
        expect(diff).toBeLessThan(1000);
    });

    it('getNoteRetentionDays returns agent value when set', () => {
        expect(getNoteRetentionDays({ NoteRetentionDays: 60 })).toBe(60);
    });

    it('getNoteRetentionDays returns default when null', () => {
        expect(getNoteRetentionDays({ NoteRetentionDays: null })).toBe(90);
    });

    it('getNoteRetentionDays returns default when not set', () => {
        expect(getNoteRetentionDays({})).toBe(90);
    });

    it('getExampleRetentionDays returns agent value when set', () => {
        expect(getExampleRetentionDays({ ExampleRetentionDays: 120 })).toBe(120);
    });

    it('getExampleRetentionDays returns default when not set', () => {
        expect(getExampleRetentionDays({})).toBe(180);
    });

    it('getAutoArchiveEnabled returns true by default', () => {
        expect(getAutoArchiveEnabled({})).toBe(true);
    });

    it('getAutoArchiveEnabled returns false when explicitly disabled', () => {
        expect(getAutoArchiveEnabled({ AutoArchiveEnabled: false })).toBe(false);
    });

    it('getAutoArchiveEnabled returns true when explicitly enabled', () => {
        expect(getAutoArchiveEnabled({ AutoArchiveEnabled: true })).toBe(true);
    });

    it('buildCleanupSummary reports stale notes', () => {
        const summary = buildCleanupSummary({ notesArchived: 5, examplesArchived: 0, notesExpired: 0, examplesExpired: 0, errors: [] });
        expect(summary).toContain('5 stale notes archived');
    });

    it('buildCleanupSummary reports expired items', () => {
        const summary = buildCleanupSummary({ notesArchived: 0, examplesArchived: 0, notesExpired: 2, examplesExpired: 3, errors: [] });
        expect(summary).toContain('2 expired notes archived');
        expect(summary).toContain('3 expired examples archived');
    });

    it('buildCleanupSummary reports errors', () => {
        const summary = buildCleanupSummary({ notesArchived: 1, examplesArchived: 0, notesExpired: 0, examplesExpired: 0, errors: ['error1', 'error2'] });
        expect(summary).toContain('2 errors encountered');
    });

    it('buildCleanupSummary reports nothing needed when all zero', () => {
        const summary = buildCleanupSummary({ notesArchived: 0, examplesArchived: 0, notesExpired: 0, examplesExpired: 0, errors: [] });
        expect(summary).toBe('No items needed archiving');
    });
});

// ============================================================================
// Extraction Guardrails Tests
// ============================================================================

describe('Extraction Guardrails', () => {
    function containsEphemeralPhrase(content: string): boolean {
        const ephemeralPatterns = [
            /this time/i, /just for now/i, /today only/i, /for this call/i,
            /temporarily/i, /one-time/i, /exception/i, /just once/i
        ];
        return ephemeralPatterns.some(pattern => pattern.test(content));
    }

    function containsDurablePhrase(content: string): boolean {
        const durablePatterns = [
            /always/i, /never/i, /company policy/i, /all customers/i,
            /standard practice/i, /we typically/i, /our preference/i,
            /every time/i, /by default/i, /as a rule/i
        ];
        return durablePatterns.some(pattern => pattern.test(content));
    }

    function containsPII(content: string): boolean {
        const piiPatterns = [
            /\b\d{3}-\d{2}-\d{4}\b/, /\b\d{16}\b/, /password[:\s]+\S+/i,
            /\bssn\b/i, /passport\s*#?\s*\d+/i
        ];
        return piiPatterns.some(pattern => pattern.test(content));
    }

    it('containsEphemeralPhrase detects "just for now"', () => {
        expect(containsEphemeralPhrase('Just for now, use bullet points')).toBe(true);
    });

    it('containsEphemeralPhrase detects "this time"', () => {
        expect(containsEphemeralPhrase('This time I want a shorter response')).toBe(true);
    });

    it('containsEphemeralPhrase returns false for durable content', () => {
        expect(containsEphemeralPhrase('We always use metric units')).toBe(false);
    });

    it('containsDurablePhrase detects "always"', () => {
        expect(containsDurablePhrase('We always use formal tone')).toBe(true);
    });

    it('containsDurablePhrase detects "company policy"', () => {
        expect(containsDurablePhrase('Company policy requires approval')).toBe(true);
    });

    it('containsDurablePhrase returns false for ephemeral content', () => {
        expect(containsDurablePhrase('Just this once, skip the greeting')).toBe(false);
    });

    it('containsPII detects SSN pattern', () => {
        expect(containsPII('My SSN is 123-45-6789')).toBe(true);
    });

    it('containsPII detects password mention', () => {
        expect(containsPII('The password is: secret123')).toBe(true);
    });

    it('containsPII returns false for safe content', () => {
        expect(containsPII('User prefers bullet points')).toBe(false);
    });
});
