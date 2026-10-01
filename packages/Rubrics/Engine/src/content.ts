/** What an evaluator is allowed to read about a subject. */
export interface RubricSubjectContent {
    text?: string;
    data?: Record<string, unknown>;
    files?: { fileId: string; name: string }[];
}

/** MJ: Test Runs. Input, expected outcomes, actual output, and output files. */
export function testRunContent(record: {
    input?: unknown;
    expectedOutcomes?: unknown;
    actualOutput?: unknown;
    trace?: string;
    files?: { fileId: string; name: string }[];
}): RubricSubjectContent {
    return {
        text: record.trace,
        data: { input: record.input, expectedOutcomes: record.expectedOutcomes, actualOutput: record.actualOutput },
        files: record.files,
    };
}

/** MJ: AI Agent Runs. Conversation turns and the final payload. */
export function agentRunContent(record: { turns?: unknown; finalPayload?: unknown }): RubricSubjectContent {
    return { data: { turns: record.turns, finalPayload: record.finalPayload } };
}

/** MJ: AI Prompt Runs. Rendered messages and the result. */
export function promptRunContent(record: { messages?: unknown; result?: unknown }): RubricSubjectContent {
    return { data: { messages: record.messages, result: record.result } };
}

/** MJ: Conversations. The transcript. */
export function conversationContent(record: { transcript?: string }): RubricSubjectContent {
    return { text: record.transcript, data: { transcript: record.transcript } };
}

/**
 * Fallback for any other entity. Fields the context user may not read are
 * omitted. canRead is the field-level permission check.
 */
export function fallbackContent(fields: Record<string, unknown>, canRead: (fieldName: string) => boolean): RubricSubjectContent {
    const data: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(fields)) {
        if (canRead(name)) data[name] = value;
    }
    return { data };
}
