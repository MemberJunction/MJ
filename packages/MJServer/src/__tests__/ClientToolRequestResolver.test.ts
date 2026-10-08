import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClientToolResponse } from '@memberjunction/ai-core-plus';

/**
 * RespondToClientToolRequest is the seam between a browser's tool answer and the waiting agent run:
 * the resolver checks the media with the real ParseClientToolMedia and hands the answer to
 * ClientToolRequestManager.ReceiveResponse, which this suite replaces to see what the run receives.
 */
const h = vi.hoisted(() => ({
    receiveResponse: vi.fn((_response: ClientToolResponse): boolean => true),
    logError: vi.fn(),
}));

// The resolver's GraphQL decorators read TypeScript type metadata that the test transform does not
// emit, so they become no-ops; the suite calls the resolver method directly.
vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    const decorators = [
        'Resolver', 'Query', 'Mutation', 'Subscription', 'Arg', 'Args', 'ArgsType', 'Ctx', 'Root', 'Info', 'Field',
        'FieldResolver', 'ObjectType', 'InputType', 'InterfaceType', 'Authorized', 'UseMiddleware', 'Extensions',
        'Directive', 'PubSub',
    ];
    return {
        ...Object.fromEntries(decorators.map((name) => [name, noopDecorator])),
        Float: class {},
        Int: class {},
        ID: class {},
        PubSubEngine: class {},
        AuthorizationError: class AuthorizationError extends Error {},
        registerEnumType: () => undefined,
        createUnionType: () => class {},
    };
});

// Replace the agent package so the resolver test does not load the @memberjunction/ai-agents graph.
vi.mock('@memberjunction/ai-agents', () => ({
    ClientToolRequestManager: { Instance: { ReceiveResponse: h.receiveResponse } },
    CLIENT_TOOL_REQUEST_TOPIC: 'CLIENT_TOOL_REQUEST',
}));

// Keep the resolver's error log out of the test output, and observable.
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: h.logError, LogStatus: vi.fn() };
});

import { ClientToolRequestResolver } from '../resolvers/ClientToolRequestResolver.js';

/** Base64 content of 3 bytes ("ABC"). */
const SMALL_BASE64 = 'QUJD';
/** Base64 content that decodes to 2,000,004 bytes, over the 2,000,000-byte limit. */
const OVERSIZED_BASE64 = 'A'.repeat(2_666_672);

/** Sends one answer through the mutation, as the browser does. */
function respond(media: string | undefined, result: string | undefined = '{"ok":true}'): Promise<boolean> {
    return new ClientToolRequestResolver().RespondToClientToolRequest('req-1', true, result, undefined, media);
}

/** The response the waiting run received. */
function received(): ClientToolResponse {
    expect(h.receiveResponse).toHaveBeenCalledTimes(1);
    return h.receiveResponse.mock.calls[0][0];
}

beforeEach(() => {
    h.receiveResponse.mockReset();
    h.receiveResponse.mockReturnValue(true);
    h.logError.mockReset();
});

describe('ClientToolRequestResolver.RespondToClientToolRequest', () => {
    it('hands valid media to the waiting run with the result', async () => {
        const media = JSON.stringify([{ MimeType: 'image/jpeg', Base64: SMALL_BASE64, Width: 1280, Height: 720 }]);

        await expect(respond(media)).resolves.toBe(true);

        expect(received()).toEqual({
            RequestID: 'req-1',
            Success: true,
            Result: { ok: true },
            ErrorMessage: undefined,
            Media: [{ MimeType: 'image/jpeg', Base64: SMALL_BASE64, Width: 1280, Height: 720 }],
        });
    });

    it('hands no Media to the run when the answer carries none', async () => {
        await respond(undefined);

        expect(received()).toEqual({ RequestID: 'req-1', Success: true, Result: { ok: true }, ErrorMessage: undefined, Media: undefined });
    });

    it.each([
        ['a MIME type that is not allowed', JSON.stringify([{ MimeType: 'image/gif', Base64: SMALL_BASE64 }]), 'media MIME type "image/gif" is not allowed'],
        ['an item over the size limit', JSON.stringify([{ MimeType: 'image/png', Base64: OVERSIZED_BASE64 }]), 'media item is 2000004 bytes; the limit is 2000000'],
        [
            'more than 4 items',
            JSON.stringify(Array.from({ length: 5 }, () => ({ MimeType: 'image/jpeg', Base64: SMALL_BASE64 }))),
            'media holds 5 items; the limit is 4',
        ],
    ])('gives the run a failed result for %s, without the result or the media', async (_case, media, reason) => {
        await respond(media);

        expect(received()).toEqual({ RequestID: 'req-1', Success: false, ErrorMessage: `Client tool media rejected: ${reason}` });
    });

    it('gives the run a failed result and returns false when the result is not valid JSON', async () => {
        await expect(respond(undefined, '{not json')).resolves.toBe(false);

        expect(received()).toEqual({
            RequestID: 'req-1',
            Success: false,
            ErrorMessage: expect.stringMatching(/^Client tool response rejected: /),
        });
        expect(h.logError).toHaveBeenCalledWith(expect.stringContaining('RespondToClientToolRequest error:'));
    });
});
