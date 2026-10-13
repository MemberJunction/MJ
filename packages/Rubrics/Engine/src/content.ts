import { BaseSingleton } from '@memberjunction/global';

/** What an evaluator is allowed to read about a subject. */
export interface RubricSubjectContent {
    text?: string;
    data?: Record<string, unknown>;
    files?: { fileId: string; name: string }[];
}

/** MJ: Test Runs. InputData, ExpectedOutputData, ActualOutputData, ResultDetails, and output files. */
export function TestRunContent(record: {
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

/** MJ: AI Agent Runs. The final payload, and the in-memory message when the run has not stored it yet. There is no Turns column. */
export function AgentRunContent(record: { finalPayload?: unknown; message?: unknown; steps?: unknown }): RubricSubjectContent {
    const data: Record<string, unknown> = { finalPayload: record.finalPayload };
    if (record.message !== undefined) data.message = record.message;
    if (record.steps !== undefined) data.steps = record.steps;
    return { text: typeof record.message === 'string' ? record.message : undefined, data };
}

/** MJ: AI Prompt Runs. Rendered messages and the result. */
export function PromptRunContent(record: { messages?: unknown; result?: unknown }): RubricSubjectContent {
    return { data: { messages: record.messages, result: record.result } };
}

/** MJ: Conversations. Name and Description. There is no Transcript column. */
export function ConversationContent(record: { name?: unknown; description?: unknown; details?: unknown }): RubricSubjectContent {
    const name = record.name == null ? '' : String(record.name);
    const description = record.description == null ? '' : String(record.description);
    const data: Record<string, unknown> = { name: record.name, description: record.description };
    if (record.details !== undefined) data.details = record.details;
    return {
        text: [name, description].filter(part => part.length > 0).join('\n'),
        data,
    };
}

/**
 * Fallback for any other entity. Fields the context user may not read are
 * omitted. canRead is the field-level permission check.
 */
export type RubricContentProvider = (record: Record<string, unknown>, canRead?: (fieldName: string) => boolean) => RubricSubjectContent;

/** Named content providers. ShapeContent asks this registry, then falls back. */
export class RubricContentRegistry extends BaseSingleton<RubricContentRegistry> {
    private readonly providers = new Map<string, RubricContentProvider>();

    public static get Instance(): RubricContentRegistry {
        return super.getInstance<RubricContentRegistry>();
    }

    public constructor() {
        super();
        this.registerBuiltIns();
    }

    public Register(entityName: string, provider: RubricContentProvider): void {
        this.providers.set(entityName, provider);
    }

    public Shape(entityName: string, record: Record<string, unknown>, canRead?: (fieldName: string) => boolean): RubricSubjectContent {
        const provider = this.providers.get(entityName);
        if (provider) return provider(record, canRead);
        return FallbackContent(record, canRead ?? (() => true));
    }

    private registerBuiltIns(): void {
        this.Register('MJ: Test Runs', record => TestRunContent({
            input: record.InputData ?? record.inputData,
            expectedOutcomes: record.ExpectedOutputData ?? record.expectedOutputData,
            actualOutput: record.ActualOutputData ?? record.actualOutputData,
            trace: (record.ResultDetails ?? record.resultDetails) as string | undefined,
            files: record.files as { fileId: string; name: string }[] | undefined,
        }));
        this.Register('MJ: AI Agent Runs', record => AgentRunContent({
            finalPayload: record.FinalPayload ?? record.finalPayload,
            message: record.Message ?? record.message,
            steps: record.Steps ?? record.steps,
        }));
        this.Register('MJ: AI Prompt Runs', record => PromptRunContent({
            messages: record.Messages ?? record.messages,
            result: record.Result ?? record.result,
        }));
        this.Register('MJ: Conversations', record => ConversationContent({
            name: record.Name ?? record.name,
            description: record.Description ?? record.description,
            details: record.Details ?? record.details,
        }));
    }
}

/** Picks the built-in mapper from the entity name. Unknown entities use the fallback. */
export function ShapeContent(entityName: string, record: Record<string, unknown>, canRead?: (fieldName: string) => boolean): RubricSubjectContent {
    return RubricContentRegistry.Instance.Shape(entityName, record, canRead);
}

export function FallbackContent(fields: Record<string, unknown>, canRead: (fieldName: string) => boolean): RubricSubjectContent {
    const data: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(fields)) {
        if (canRead(name)) data[name] = value;
    }
    return { data };
}

