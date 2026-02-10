/**
 * Unit tests for Agent Memory Features (Phase 1-3 improvements).
 *
 * These tests verify:
 * - PayloadFeedbackManager functionality
 * - AgentContextInjector formatting with precedence instructions
 * - Multi-tenant scope determination
 *
 * To run these tests:
 *   npx ts-node src/__tests__/agent-memory-features.test.ts
 *
 * @since 2.130.0
 */

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
 * Determine secondary scope description for a note (multi-tenant feature)
 */
function determineSecondaryScope(note: MockNote): string | null {
    if (!note.PrimaryScopeRecordID) {
        return null; // No secondary scope
    }

    const hasSecondary = note.SecondaryScopes && note.SecondaryScopes !== '{}';

    if (hasSecondary) {
        return 'User-specific (most specific)';
    }

    return 'Company-level';
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
        lines.push('2) User-specific notes override company-level');
        lines.push('3) Company notes override global defaults');
        lines.push('4) When same scope, prefer most recent by date');
        lines.push('');
        lines.push('Conflict resolution:');
        lines.push('- If two notes contradict, prefer the more specific scope');
        lines.push('- Ask clarifying question only if conflict materially affects response');
        lines.push('</memory_policy>');
        lines.push('');
    }

    lines.push(`📝 AGENT NOTES (${notes.length})`);
    lines.push('');

    for (const note of notes) {
        lines.push(`[${note.Type}] ${note.Note}`);

        const scope = determineNoteScope(note);
        const secondaryScope = determineSecondaryScope(note);

        if (secondaryScope) {
            lines.push(`  Scope: ${secondaryScope}`);
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
// Tests
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void) {
    try {
        fn();
        console.log(`✅ ${name}`);
        testsPassed++;
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   Error: ${error instanceof Error ? error.message : error}`);
        testsFailed++;
    }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertTrue(condition: boolean, message?: string) {
    if (!condition) {
        throw new Error(message || 'Expected condition to be true');
    }
}

function assertContains(str: string, substring: string, message?: string) {
    if (!str.includes(substring)) {
        throw new Error(`${message || 'String does not contain expected substring'}: "${substring}"`);
    }
}

console.log('\n=== Agent Memory Features Tests ===\n');

// ============================================================================
// Scope Determination Tests
// ============================================================================

console.log('--- Scope Determination Tests ---\n');

runTest('determineNoteScope: Agent + User specific', () => {
    const note = mockNotes[0]; // has AgentID and UserID
    const scope = determineNoteScope(note);
    assertEqual(scope, 'Agent + User specific');
});

runTest('determineNoteScope: Company-wide', () => {
    const note = mockNotes[1]; // has only CompanyID
    const scope = determineNoteScope(note);
    assertEqual(scope, 'Company-wide');
});

runTest('determineNoteScope: Global (all null)', () => {
    const note = mockNotes[2]; // all nulls
    const scope = determineNoteScope(note);
    assertEqual(scope, 'Global');
});

runTest('determineSecondaryScope: Company-level (primary scope only)', () => {
    const note = mockNotes[1]; // has PrimaryScopeRecordID but no SecondaryScopes
    const scope = determineSecondaryScope(note);
    assertEqual(scope, 'Company-level');
});

runTest('determineSecondaryScope: User-specific (has secondary scopes)', () => {
    const note = mockNotes[3]; // has both primary and secondary scopes
    const scope = determineSecondaryScope(note);
    assertEqual(scope, 'User-specific (most specific)');
});

runTest('determineSecondaryScope: null when no secondary scope', () => {
    const note = mockNotes[0]; // no PrimaryScopeRecordID
    const scope = determineSecondaryScope(note);
    assertEqual(scope, null);
});

// ============================================================================
// Format Notes with Precedence Tests
// ============================================================================

console.log('\n--- Format Notes Tests ---\n');

runTest('formatNotesForInjection: includes memory policy by default', () => {
    const result = formatNotesForInjection(mockNotes);
    assertContains(result, '<memory_policy>');
    assertContains(result, 'Precedence (highest to lowest)');
    assertContains(result, 'User-specific notes override company-level');
    assertContains(result, '</memory_policy>');
});

runTest('formatNotesForInjection: excludes memory policy when disabled', () => {
    const result = formatNotesForInjection(mockNotes, false);
    assertTrue(!result.includes('<memory_policy>'), 'Should not contain memory_policy');
});

runTest('formatNotesForInjection: includes note count', () => {
    const result = formatNotesForInjection(mockNotes);
    assertContains(result, `📝 AGENT NOTES (${mockNotes.length})`);
});

runTest('formatNotesForInjection: includes note types and content', () => {
    const result = formatNotesForInjection(mockNotes);
    assertContains(result, '[Preference] User prefers bullet points');
    assertContains(result, '[Context] Company uses metric units');
    assertContains(result, '[Constraint] Never share PII');
});

runTest('formatNotesForInjection: shows secondary scope when available', () => {
    const result = formatNotesForInjection(mockNotes);
    assertContains(result, 'Company-level');
    assertContains(result, 'User-specific (most specific)');
});

runTest('formatNotesForInjection: returns empty string for empty notes', () => {
    const result = formatNotesForInjection([]);
    assertEqual(result, '');
});

// ============================================================================
// Feedback Question Generation Tests
// ============================================================================

console.log('\n--- Feedback Question Tests ---\n');

runTest('generateQuestions: filters out non-feedback warnings', () => {
    const questions = generateQuestions(mockWarnings);
    assertEqual(questions.length, 2, 'Should only include warnings with requiresFeedback=true');
});

runTest('generateQuestions: formats content_truncation correctly', () => {
    const questions = generateQuestions(mockWarnings);
    const truncQuestion = questions[0];
    assertContains(truncQuestion.question, 'reduce the content');
    assertContains(truncQuestion.question, '1000 to 100');
    assertContains(truncQuestion.question, '90.0%');
});

runTest('generateQuestions: formats key_removal correctly', () => {
    const questions = generateQuestions(mockWarnings);
    const removalQuestion = questions[1];
    assertContains(removalQuestion.question, 'remove the non-empty key(s)');
    assertContains(removalQuestion.question, 'timestamp');
    assertContains(removalQuestion.question, 'version');
});

runTest('generateQuestions: includes context with path and type', () => {
    const questions = generateQuestions(mockWarnings);
    const question = questions[0];
    assertTrue(question.context !== undefined, 'Should have context');
    assertEqual(question.context?.path, 'response.body');
    assertEqual(question.context?.changeType, 'content_truncation');
});

// ============================================================================
// LLM Response Mapping Tests
// ============================================================================

console.log('\n--- LLM Response Mapping Tests ---\n');

runTest('mapLLMResponsesToFeedback: maps responses correctly', () => {
    const questions = generateQuestions(mockWarnings);
    const llmResponses = [
        { questionNumber: 1, intended: false, explanation: 'This was a mistake' },
        { questionNumber: 2, intended: true, explanation: 'Intended cleanup' }
    ];

    const result = mapLLMResponsesToFeedback(questions, llmResponses);

    assertEqual(result.length, 2);
    assertEqual(result[0].intended, false);
    assertEqual(result[0].explanation, 'This was a mistake');
    assertEqual(result[1].intended, true);
});

runTest('mapLLMResponsesToFeedback: defaults to intended when no response', () => {
    const questions = generateQuestions(mockWarnings);
    const llmResponses: Array<{ questionNumber: number; intended: boolean; explanation?: string }> = [];

    const result = mapLLMResponsesToFeedback(questions, llmResponses);

    assertTrue(result.every(r => r.intended === true), 'All should default to intended');
    assertContains(result[0].explanation || '', 'No explicit response');
});

// ============================================================================
// Memory Cleanup Agent Tests
// ============================================================================

console.log('\n--- Memory Cleanup Agent Tests ---\n');

/**
 * Calculate cutoff date for retention (mirrors MemoryCleanupAgent)
 */
function getCutoffDate(retentionDays: number): string {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    return cutoff.toISOString();
}

/**
 * Get note retention days with default (mirrors MemoryCleanupAgent)
 */
function getNoteRetentionDays(agent: { NoteRetentionDays?: number | null }): number {
    const DEFAULT_NOTE_RETENTION_DAYS = 90;
    if (typeof agent.NoteRetentionDays === 'number' && agent.NoteRetentionDays > 0) {
        return agent.NoteRetentionDays;
    }
    return DEFAULT_NOTE_RETENTION_DAYS;
}

/**
 * Get example retention days with default (mirrors MemoryCleanupAgent)
 */
function getExampleRetentionDays(agent: { ExampleRetentionDays?: number | null }): number {
    const DEFAULT_EXAMPLE_RETENTION_DAYS = 180;
    if (typeof agent.ExampleRetentionDays === 'number' && agent.ExampleRetentionDays > 0) {
        return agent.ExampleRetentionDays;
    }
    return DEFAULT_EXAMPLE_RETENTION_DAYS;
}

/**
 * Check if auto-archive is enabled (mirrors MemoryCleanupAgent)
 */
function getAutoArchiveEnabled(agent: { AutoArchiveEnabled?: boolean }): boolean {
    return agent.AutoArchiveEnabled !== false;
}

/**
 * Build cleanup summary message (mirrors MemoryCleanupAgent)
 */
function buildCleanupSummary(result: {
    notesArchived: number;
    examplesArchived: number;
    notesExpired: number;
    examplesExpired: number;
    errors: string[];
}): string {
    const parts: string[] = [];

    if (result.notesArchived > 0) {
        parts.push(`${result.notesArchived} stale notes archived`);
    }
    if (result.examplesArchived > 0) {
        parts.push(`${result.examplesArchived} stale examples archived`);
    }
    if (result.notesExpired > 0) {
        parts.push(`${result.notesExpired} expired notes archived`);
    }
    if (result.examplesExpired > 0) {
        parts.push(`${result.examplesExpired} expired examples archived`);
    }

    if (parts.length === 0) {
        parts.push('No items needed archiving');
    }

    if (result.errors.length > 0) {
        parts.push(`${result.errors.length} errors encountered`);
    }

    return parts.join(', ');
}

runTest('getCutoffDate: calculates correct date for 90 days', () => {
    const now = new Date();
    const cutoffStr = getCutoffDate(90);
    const cutoffDate = new Date(cutoffStr);

    // Should be approximately 90 days ago (allow 1 second tolerance)
    const expectedDate = new Date(now);
    expectedDate.setDate(expectedDate.getDate() - 90);

    const diff = Math.abs(cutoffDate.getTime() - expectedDate.getTime());
    assertTrue(diff < 1000, 'Cutoff date should be approximately 90 days ago');
});

runTest('getNoteRetentionDays: returns agent value when set', () => {
    const agent = { NoteRetentionDays: 60 };
    assertEqual(getNoteRetentionDays(agent), 60);
});

runTest('getNoteRetentionDays: returns default when null', () => {
    const agent = { NoteRetentionDays: null };
    assertEqual(getNoteRetentionDays(agent), 90);
});

runTest('getNoteRetentionDays: returns default when not set', () => {
    const agent = {};
    assertEqual(getNoteRetentionDays(agent), 90);
});

runTest('getExampleRetentionDays: returns agent value when set', () => {
    const agent = { ExampleRetentionDays: 120 };
    assertEqual(getExampleRetentionDays(agent), 120);
});

runTest('getExampleRetentionDays: returns default when not set', () => {
    const agent = {};
    assertEqual(getExampleRetentionDays(agent), 180);
});

runTest('getAutoArchiveEnabled: returns true by default', () => {
    const agent = {};
    assertEqual(getAutoArchiveEnabled(agent), true);
});

runTest('getAutoArchiveEnabled: returns false when explicitly disabled', () => {
    const agent = { AutoArchiveEnabled: false };
    assertEqual(getAutoArchiveEnabled(agent), false);
});

runTest('getAutoArchiveEnabled: returns true when explicitly enabled', () => {
    const agent = { AutoArchiveEnabled: true };
    assertEqual(getAutoArchiveEnabled(agent), true);
});

runTest('buildCleanupSummary: reports stale notes', () => {
    const result = { notesArchived: 5, examplesArchived: 0, notesExpired: 0, examplesExpired: 0, errors: [] };
    const summary = buildCleanupSummary(result);
    assertContains(summary, '5 stale notes archived');
});

runTest('buildCleanupSummary: reports expired items', () => {
    const result = { notesArchived: 0, examplesArchived: 0, notesExpired: 2, examplesExpired: 3, errors: [] };
    const summary = buildCleanupSummary(result);
    assertContains(summary, '2 expired notes archived');
    assertContains(summary, '3 expired examples archived');
});

runTest('buildCleanupSummary: reports errors', () => {
    const result = { notesArchived: 1, examplesArchived: 0, notesExpired: 0, examplesExpired: 0, errors: ['error1', 'error2'] };
    const summary = buildCleanupSummary(result);
    assertContains(summary, '2 errors encountered');
});

runTest('buildCleanupSummary: reports nothing needed when all zero', () => {
    const result = { notesArchived: 0, examplesArchived: 0, notesExpired: 0, examplesExpired: 0, errors: [] };
    const summary = buildCleanupSummary(result);
    assertEqual(summary, 'No items needed archiving');
});

// ============================================================================
// Extraction Guardrails Tests
// ============================================================================

console.log('\n--- Extraction Guardrails Tests ---\n');

/**
 * Check if content contains ephemeral phrases (should not be stored)
 */
function containsEphemeralPhrase(content: string): boolean {
    const ephemeralPatterns = [
        /this time/i,
        /just for now/i,
        /today only/i,
        /for this call/i,
        /temporarily/i,
        /one-time/i,
        /exception/i,
        /just once/i
    ];
    return ephemeralPatterns.some(pattern => pattern.test(content));
}

/**
 * Check if content contains durable phrases (should be stored at org/global scope)
 */
function containsDurablePhrase(content: string): boolean {
    const durablePatterns = [
        /always/i,
        /never/i,
        /company policy/i,
        /all customers/i,
        /standard practice/i,
        /we typically/i,
        /our preference/i,
        /every time/i,
        /by default/i,
        /as a rule/i
    ];
    return durablePatterns.some(pattern => pattern.test(content));
}

/**
 * Check if content contains PII that should not be extracted
 */
function containsPII(content: string): boolean {
    const piiPatterns = [
        /\b\d{3}-\d{2}-\d{4}\b/,  // SSN pattern
        /\b\d{16}\b/,             // Credit card
        /password[:\s]+\S+/i,     // Password mention
        /\bssn\b/i,               // SSN mention
        /passport\s*#?\s*\d+/i    // Passport
    ];
    return piiPatterns.some(pattern => pattern.test(content));
}

runTest('containsEphemeralPhrase: detects "just for now"', () => {
    assertTrue(containsEphemeralPhrase('Just for now, use bullet points'));
});

runTest('containsEphemeralPhrase: detects "this time"', () => {
    assertTrue(containsEphemeralPhrase('This time I want a shorter response'));
});

runTest('containsEphemeralPhrase: returns false for durable content', () => {
    assertTrue(!containsEphemeralPhrase('We always use metric units'));
});

runTest('containsDurablePhrase: detects "always"', () => {
    assertTrue(containsDurablePhrase('We always use formal tone'));
});

runTest('containsDurablePhrase: detects "company policy"', () => {
    assertTrue(containsDurablePhrase('Company policy requires approval'));
});

runTest('containsDurablePhrase: returns false for ephemeral content', () => {
    assertTrue(!containsDurablePhrase('Just this once, skip the greeting'));
});

runTest('containsPII: detects SSN pattern', () => {
    assertTrue(containsPII('My SSN is 123-45-6789'));
});

runTest('containsPII: detects password mention', () => {
    assertTrue(containsPII('The password is: secret123'));
});

runTest('containsPII: returns false for safe content', () => {
    assertTrue(!containsPII('User prefers bullet points'));
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n=== Test Summary ===\n');
console.log(`Total: ${testsPassed + testsFailed}`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);

if (testsFailed > 0) {
    process.exit(1);
}

console.log('\n✅ All tests passed!\n');
