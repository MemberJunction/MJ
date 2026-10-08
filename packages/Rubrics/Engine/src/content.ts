import { BaseSingleton } from '@memberjunction/global';

/** One frame a judge may look at. `data` is base64 with no data-URL prefix. */
export interface RubricSubjectImage {
    label: string;
    mimeType: string;
    data: string;
}

/** What an evaluator is allowed to read about a subject. */
export interface RubricSubjectContent {
    text?: string;
    data?: Record<string, unknown>;
    files?: { fileId: string; name: string }[];
    /** Frames sent to the judge as images after the subject text. */
    images?: RubricSubjectImage[];
}

/** The first, the last, and evenly spaced items between them, at most `max`. */
export function SelectEvenly<T>(items: T[], max: number): T[] {
    if (max <= 0 || items.length === 0) return [];
    if (items.length <= max) return [...items];
    if (max === 1) return [items[items.length - 1]];
    const picked: T[] = [];
    for (let i = 0; i < max; i++) {
        picked.push(items[Math.round(i * (items.length - 1) / (max - 1))]);
    }
    return picked;
}

/** MJ: Test Runs. InputData, ExpectedOutputData, ActualOutputData, ResultDetails, output files, and saved screenshots. */
export function TestRunContent(record: {
    input?: unknown;
    expectedOutcomes?: unknown;
    actualOutput?: unknown;
    trace?: string;
    files?: { fileId: string; name: string }[];
    images?: RubricSubjectImage[];
}): RubricSubjectContent {
    const content: RubricSubjectContent = {
        text: record.trace,
        data: { input: record.input, expectedOutcomes: record.expectedOutcomes, actualOutput: record.actualOutput },
        files: record.files,
    };
    if (record.images && record.images.length > 0) content.images = record.images;
    return content;
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
            images: record.Images as RubricSubjectImage[] | undefined,
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

