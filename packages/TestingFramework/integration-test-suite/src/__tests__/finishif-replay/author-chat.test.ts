import { describe, it, expect, vi } from 'vitest';
import { ChatMessageRole, ChatParams, ChatResult } from '@memberjunction/ai';
import {
    AUTHOR_MAX_OUTPUT_TOKENS,
    SelectAuthorCandidates,
    VendorFailoverChat,
    type AuthorCandidate,
    type AuthorDriver,
    type AuthorVendorRow
} from '../../finishif-replay/author-chat';

function vendor(Vendor: string, DriverClass: string | null, Priority: number, Status: AuthorVendorRow['Status'] = 'Active'): AuthorVendorRow {
    return { Vendor, DriverClass, APIName: `${Vendor.toLowerCase()}-model`, Priority, Status };
}

function answered(text: string): ChatResult {
    const result = new ChatResult(true, new Date(), new Date());
    result.data = { choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop', index: 0 }] };
    return result;
}

function refused(message: string): ChatResult {
    const result = new ChatResult(false, new Date(), new Date());
    result.errorMessage = message;
    return result;
}

/** A driver that returns, or throws, each scripted result in turn. */
function driver(...results: Array<ChatResult | Error>): AuthorDriver & { Params: ChatParams[] } {
    const params: ChatParams[] = [];
    return {
        Params: params,
        ChatCompletion: vi.fn(async (p: ChatParams): Promise<ChatResult> => {
            params.push(p);
            const next = results[Math.min(params.length - 1, results.length - 1)];
            if (next instanceof Error) {
                throw next;
            }
            return next;
        })
    };
}

const MESSAGES = [{ role: ChatMessageRole.user, content: 'hi' }];

describe('SelectAuthorCandidates', () => {
    it('keeps every active vendor with a driver class, an API name and a key, highest priority first', () => {
        const rows = [
            vendor('Second', 'SecondLLM', 5),
            vendor('Default', 'DefaultLLM', 10),
            vendor('Keyless', 'KeylessLLM', 20),
            vendor('Retired', 'RetiredLLM', 30, 'Inactive'),
            vendor('Driverless', null, 40)
        ];
        const candidates = SelectAuthorCandidates(rows, driverClass => driverClass !== 'KeylessLLM');
        expect(candidates.map(c => c.Vendor)).toEqual(['Default', 'Second']);
        expect(candidates[0]).toEqual({ DriverClass: 'DefaultLLM', APIName: 'default-model', Vendor: 'Default', Priority: 10 });
    });
});

describe('VendorFailoverChat', () => {
    const candidates: AuthorCandidate[] = [
        { DriverClass: 'FirstLLM', APIName: 'first-model', Vendor: 'First', Priority: 10 },
        { DriverClass: 'SecondLLM', APIName: 'second-model', Vendor: 'Second', Priority: 5 }
    ];

    it('calls the model by its API name, with a bounded output', async () => {
        const first = driver(answered('{"ok":true}'));
        const chat = new VendorFailoverChat(candidates, c => (c.Vendor === 'First' ? first : null));
        const reply = await chat.Complete(MESSAGES);
        expect(reply).toEqual({ Success: true, Text: '{"ok":true}', Error: null });
        expect(first.Params[0].model).toBe('first-model');
        expect(first.Params[0].maxOutputTokens).toBe(AUTHOR_MAX_OUTPUT_TOKENS);
        expect(first.Params[0].messages).toEqual(MESSAGES);
    });

    it('tries the next vendor when one fails, throws or is not registered, and then prefers the one that answered', async () => {
        const first = driver(refused('rate limited'), answered('from first'));
        const second = driver(answered('from second'));
        const chat = new VendorFailoverChat(candidates, c => (c.Vendor === 'First' ? first : second));
        expect((await chat.Complete(MESSAGES)).Text).toBe('from second');
        expect((await chat.Complete(MESSAGES)).Text).toBe('from second');
        expect(first.Params).toHaveLength(1);

        const throwing = new VendorFailoverChat(candidates, c => (c.Vendor === 'First' ? driver(new Error('socket hang up')) : null));
        const failed = await throwing.Complete(MESSAGES);
        expect(failed.Success).toBe(false);
        expect(failed.Error).toContain('First: socket hang up');
        expect(failed.Error).toContain('Second: driver class SecondLLM is not registered');
    });

    it('fails plainly with no candidates', async () => {
        expect(await new VendorFailoverChat([], () => null).Complete(MESSAGES)).toMatchObject({ Success: false });
    });
});
