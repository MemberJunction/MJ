import { describe, it, expect, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { BaseRealtimeModel, RealtimeProxyRegistry, IRealtimeSession, RealtimeSessionParams } from '@memberjunction/ai';
import { createOpenAILiveBrokerRouter } from '../rest/OpenAILiveBrokerHandler.js';

@RegisterClass(BaseRealtimeModel, 'MockOpenAILiveForBrokerTest', 10)
class MockOpenAILiveForBrokerTest extends BaseRealtimeModel {
    public override async StartSession(_params: RealtimeSessionParams): Promise<IRealtimeSession> {
        throw new Error('Not needed in broker test');
    }

    public override async ExchangeWebRtcSdp(
        offerSdp: string,
        _sessionConfig?: Record<string, unknown>
    ): Promise<{ answerSdp: string; sessionId: string; prebillSeconds: number }> {
        return {
            answerSdp: `mock_answer_for_${offerSdp}`,
            sessionId: 'sess_mock_123',
            prebillSeconds: 15,
        };
    }
}

function makeMockReqRes(query: Record<string, string>, body: unknown): {
    req: Request;
    res: Response;
    getStatus: () => number;
    getJson: () => Record<string, unknown>;
} {
    let statusCode = 200;
    let jsonBody: Record<string, unknown> = {};

    const res = {
        status(code: number): Response {
            statusCode = code;
            return res as unknown as Response;
        },
        json(data: Record<string, unknown>): Response {
            jsonBody = data;
            return res as unknown as Response;
        },
    };

    const req = {
        method: 'POST',
        url: '/',
        query,
        body,
    };

    return {
        req: req as unknown as Request,
        res: res as unknown as Response,
        getStatus: () => statusCode,
        getJson: () => jsonBody,
    };
}

describe('OpenAILiveBrokerHandler', () => {
    let router: ReturnType<typeof createOpenAILiveBrokerRouter>;

    beforeEach(() => {
        router = createOpenAILiveBrokerRouter();
    });

    it('rejects missing ticket with 401', async () => {
        const { req, res, getStatus, getJson } = makeMockReqRes({}, { sdp: 'v=0...' });
        // @ts-expect-error reaching the route handler directly
        await router.handle(req, res, () => {});
        expect(getStatus()).toBe(401);
        expect(getJson().error).toContain('missing ticket');
    });

    it('rejects invalid or expired ticket with 401', async () => {
        const { req, res, getStatus, getJson } = makeMockReqRes({ ticket: 'non-existent-ticket' }, { sdp: 'v=0...' });
        // @ts-expect-error reaching the route handler directly
        await router.handle(req, res, () => {});
        expect(getStatus()).toBe(401);
        expect(getJson().error).toContain('invalid or expired ticket');
    });

    it('rejects missing sdp in request body with 400', async () => {
        const ticket = RealtimeProxyRegistry.Instance.Issue({
            UpstreamUrl: 'https://api.openai.com/v1/live/sessions',
            UpstreamAuthHeader: 'test-key',
            DriverClass: 'MockOpenAILiveForBrokerTest',
            TTLSeconds: 60,
        });

        const { req, res, getStatus, getJson } = makeMockReqRes({ ticket: ticket.ID }, {});
        // @ts-expect-error reaching the route handler directly
        await router.handle(req, res, () => {});
        expect(getStatus()).toBe(400);
        expect(getJson().error).toContain('Missing or invalid sdp');
    });

    it('exchanges SDP offer for answer with a valid ticket and consumes the ticket', async () => {
        const ticket = RealtimeProxyRegistry.Instance.Issue({
            UpstreamUrl: 'https://api.openai.com/v1/live/sessions',
            UpstreamAuthHeader: 'test-key',
            DriverClass: 'MockOpenAILiveForBrokerTest',
            TTLSeconds: 60,
        });

        const { req, res, getStatus, getJson } = makeMockReqRes({ ticket: ticket.ID }, { sdp: 'offer_123', session: { model: 'gpt-live-1' } });
        // @ts-expect-error reaching the route handler directly
        await router.handle(req, res, () => {});

        expect(getStatus()).toBe(200);
        const json = getJson();
        expect(json.answerSdp).toBe('mock_answer_for_offer_123');
        expect(json.sessionId).toBe('sess_mock_123');
        expect(json.prebillSeconds).toBe(15);

        // Ticket is single-use: consuming again should fail
        const reused = makeMockReqRes({ ticket: ticket.ID }, { sdp: 'offer_123' });
        // @ts-expect-error reaching the route handler directly
        await router.handle(reused.req, reused.res, () => {});
        expect(reused.getStatus()).toBe(401);
    });
});
