/**
 * decision-guards.ts — the network guards the subq-mercury-decisions bundle puts over the decision
 * drivers: a guarded driver is the shipped class with only `SendRequest`, its one network
 * call, replaced. It records each request and answers only while a check arms it, refusing with a 500
 * otherwise, so no request leaves the process.
 *
 * NOT a check bundle: it registers nothing on import. A bundle registers its guarded drivers in its
 * lifecycle Setup (`RegisterDecisionStandIn`) and restores the shipped classes in Teardown.
 *
 * {@link OPENROUTER_GUARD} is shared: every bundle that guards `OpenRouterDecision` through
 * {@link GuardedOpenRouterDecision} reads and arms the same state, so each one resets it
 * ({@link ResetGuards}) in Setup and Teardown.
 */
import { OpenRouterDecision } from '@memberjunction/ai-openrouter';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';

/** One request a guard received. */
export interface GuardedRequest {
    Url: string;
    Authorization: string | null;
    Body: unknown;
}

/** How an armed guard answers a request. */
export type GuardResponder = (request: GuardedRequest) => Response;

/**
 * What one guard was sent, and how it answers; an undefined `Respond` refuses. Module state, because the
 * runner builds its own drivers through the ClassFactory.
 */
export interface GuardState {
    Requests: GuardedRequest[];
    Respond: GuardResponder | undefined;
}

/** A guard that has received nothing and refuses every request. */
export function NewGuardState(): GuardState {
    return { Requests: [], Respond: undefined };
}

/** A JSON response with the given status. */
export function JSONResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Records the request on `guard`, then answers as the guard is armed to, or refuses with a 500. Never
 * calls the network.
 * @param service The vendor's name, for the refusal's message.
 */
export function GuardedSend(guard: GuardState, service: string, url: string, init: RequestInit): Response {
    const request: GuardedRequest = { Url: url, Authorization: new Headers(init.headers).get('Authorization'), Body: JSON.parse(String(init.body)) };
    guard.Requests.push(request);
    return guard.Respond
        ? guard.Respond(request)
        : JSONResponse(500, { error: { message: `The integration-test ${service} guard is not armed: no request leaves this process` } });
}

/** Clears what each guard received and disarms it. */
export function ResetGuards(guards: readonly GuardState[]): void {
    for (const guard of guards) {
        guard.Requests.length = 0;
        guard.Respond = undefined;
    }
}

/**
 * Arms each guard with its responder (undefined leaves it refusing) for the length of `work`, then
 * disarms them all.
 */
export async function WithGuardsArmed<T>(arming: ReadonlyArray<readonly [GuardState, GuardResponder | undefined]>, work: () => Promise<T>): Promise<T> {
    for (const [guard, respond] of arming) {
        guard.Respond = respond;
    }
    try {
        return await work();
    } finally {
        for (const [guard] of arming) {
            guard.Respond = undefined;
        }
    }
}

/**
 * Asserts exactly one request reached `guard` since `before` (its request count then), to `url`, with
 * `key` as the bearer, never a credential's JSON, and `body`.
 */
export function AssertOneRequest(guard: GuardState, before: number, url: string, key: string, body: unknown, label: string): void {
    AssertEqual(guard.Requests.length - before, 1, `${label}: requests`);
    const sent = guard.Requests[guard.Requests.length - 1];
    AssertEqual(sent.Url, url, `${label}: request URL`);
    Assert(!(sent.Authorization ?? '').includes('{'), `${label}: the bearer is a credential's JSON, not its token: ${String(sent.Authorization)}`);
    AssertEqual(sent.Authorization, `Bearer ${key}`, `${label}: Authorization header`);
    AssertEqual(JSON.stringify(sent.Body), JSON.stringify(body), `${label}: request body`);
}

/** The shared guard state of {@link GuardedOpenRouterDecision}. */
export const OPENROUTER_GUARD: GuardState = NewGuardState();

/** The real `OpenRouterDecision` with only its network call replaced by {@link OPENROUTER_GUARD}. */
export class GuardedOpenRouterDecision extends OpenRouterDecision {
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        return GuardedSend(OPENROUTER_GUARD, 'OpenRouter', url, init);
    }
}
