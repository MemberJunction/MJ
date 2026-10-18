/**
 * author-chat.ts — the author's chat model: a `BaseLLM` driver from the ClassFactory, for whichever
 * of the model's active inference vendors has an API key.
 *
 * Every active vendor is a candidate, not only the model's default, so a model reachable through a
 * second vendor still works when the first has no key or fails. A candidate that answers is tried
 * first from then on.
 */
import { ChatParams, type BaseLLM, type ChatMessage, type ChatResult } from '@memberjunction/ai';
import type { MJAIModelVendorEntity } from '@memberjunction/core-entities';
import type { AuthorChat, AuthorChatReply } from './author';

/** The most output the author may write: a finishIf is a few short sentences. */
export const AUTHOR_MAX_OUTPUT_TOKENS = 1024;

/** The columns of a model-vendor row the candidate list reads. */
export type AuthorVendorRow = Pick<MJAIModelVendorEntity, 'DriverClass' | 'APIName' | 'Priority' | 'Status' | 'Vendor'>;

/** One vendor the author can call the model through. */
export interface AuthorCandidate {
    DriverClass: string;
    APIName: string;
    Vendor: string;
    Priority: number;
}

/** What the author calls on a driver: `BaseLLM`'s chat completion. */
export type AuthorDriver = Pick<BaseLLM, 'ChatCompletion'>;

/** Creates the driver for a candidate, or returns null when its class is not registered. */
export type AuthorDriverFactory = (candidate: AuthorCandidate) => AuthorDriver | null;

/**
 * The candidates for a model: its active inference vendors that have a driver class, an API name
 * and an API key, highest priority first.
 *
 * @param vendors The model's inference-vendor rows.
 * @param hasKey Whether a driver class has an API key.
 */
export function SelectAuthorCandidates(vendors: readonly AuthorVendorRow[], hasKey: (driverClass: string) => boolean): AuthorCandidate[] {
    return vendors
        .filter(v => v.Status === 'Active' && !!v.DriverClass && !!v.APIName && hasKey(v.DriverClass))
        .map(v => ({ DriverClass: v.DriverClass ?? '', APIName: v.APIName ?? '', Vendor: v.Vendor, Priority: v.Priority }))
        .sort((a, b) => b.Priority - a.Priority);
}

/** The reply text of a chat result. */
function replyText(result: ChatResult): string {
    const content = result.data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
}

/** An {@link AuthorChat} that tries each candidate in turn until one answers. */
export class VendorFailoverChat implements AuthorChat {
    private preferred = 0;
    private readonly drivers = new Map<number, AuthorDriver | null>();

    /**
     * @param candidates The vendors to try, in order.
     * @param createDriver Creates a candidate's driver.
     */
    constructor(private readonly candidates: readonly AuthorCandidate[], private readonly createDriver: AuthorDriverFactory) {}

    /** The candidates, in the order given. */
    public get Candidates(): readonly AuthorCandidate[] {
        return this.candidates;
    }

    public async Complete(messages: ChatMessage[]): Promise<AuthorChatReply> {
        if (this.candidates.length === 0) {
            return { Success: false, Text: '', Error: 'the model has no active vendor with an API key' };
        }
        const errors: string[] = [];
        for (const index of this.order()) {
            const reply = await this.tryCandidate(index, messages);
            if (reply.Success) {
                this.preferred = index;
                return reply;
            }
            errors.push(`${this.candidates[index].Vendor}: ${reply.Error ?? 'failed'}`);
        }
        return { Success: false, Text: '', Error: errors.join('; ') };
    }

    /** Candidate indexes, the preferred one first. */
    private order(): number[] {
        const rest = this.candidates.map((_, i) => i).filter(i => i !== this.preferred);
        return [this.preferred, ...rest];
    }

    /** A candidate's driver, created once. */
    private driverFor(index: number): AuthorDriver | null {
        if (!this.drivers.has(index)) {
            this.drivers.set(index, this.createDriver(this.candidates[index]));
        }
        return this.drivers.get(index) ?? null;
    }

    private async tryCandidate(index: number, messages: ChatMessage[]): Promise<AuthorChatReply> {
        const candidate = this.candidates[index];
        const driver = this.driverFor(index);
        if (!driver) {
            return { Success: false, Text: '', Error: `driver class ${candidate.DriverClass} is not registered` };
        }
        const params = new ChatParams();
        params.model = candidate.APIName;
        params.messages = messages;
        params.maxOutputTokens = AUTHOR_MAX_OUTPUT_TOKENS;
        try {
            const result = await driver.ChatCompletion(params);
            return result.success
                ? { Success: true, Text: replyText(result), Error: null }
                : { Success: false, Text: '', Error: result.errorMessage ?? 'the call failed' };
        } catch (error) {
            return { Success: false, Text: '', Error: error instanceof Error ? error.message : String(error) };
        }
    }
}
