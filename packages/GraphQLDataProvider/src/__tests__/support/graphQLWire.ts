/**
 * Fake GraphQL wire for GraphQLDataProvider behavioral tests.
 *
 * This module is the ONE mocking seam the behavioral suites use: it stands in for the
 * `graphql-request` package (the network boundary) so the REAL GraphQLDataProvider —
 * and the REAL ProviderBase orchestration above it — run unmodified while every
 * (document, variables) pair that would have gone over HTTP is captured for assertion.
 *
 * Test files register it via:
 * ```ts
 * vi.mock('graphql-request', async () => {
 *   const wire = await import('./support/graphQLWire');
 *   return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
 * });
 * ```
 * Because both the mock factory and the test file import this module through the same
 * module cache, the exported `GraphQLWire` registry is shared between them.
 *
 * IMPORTANT: this module must not import anything from the provider package (or from
 * `graphql-request` itself) so the vi.mock factory can load it without cycles.
 */

/** A single request captured at the wire. */
export interface CapturedGraphQLRequest {
    /** The GraphQL document string exactly as the provider sent it. */
    document: string;
    /** The variables object exactly as the provider sent it. */
    variables: Record<string, unknown> | null | undefined;
    /** Index (into `GraphQLWire.Clients`) of the client instance that sent it. */
    clientIndex: number;
}

/** Scripted behavior for one wire round-trip. May return a response or throw. */
export type WireResponder = (
    document: string,
    variables: Record<string, unknown> | null | undefined
) => unknown;

/**
 * Error shaped like the ClientError that graphql-request throws when the server
 * returns GraphQL errors — the exact shape `GraphQLDataProvider.ExecuteGQL` inspects
 * (`e.response.errors[0].extensions.code`).
 */
export class FakeGraphQLResponseError extends Error {
    public response: { errors: Array<{ message: string; extensions?: { code?: string } }> };

    constructor(message: string, code?: string) {
        super(message);
        this.name = 'FakeGraphQLResponseError';
        this.response = {
            errors: [
                code !== undefined
                    ? { message, extensions: { code } }
                    : { message },
            ],
        };
    }
}

/**
 * Central registry: every FakeGraphQLClient the provider creates registers itself here,
 * every request is logged here, and scripted responses are consumed FIFO from here.
 */
class GraphQLWireRegistry {
    /** Every client instance created since the last Reset(), in creation order. */
    public Clients: FakeGraphQLClient[] = [];
    /** Every request sent since the last Reset(), in send order. */
    public Requests: CapturedGraphQLRequest[] = [];
    private responders: WireResponder[] = [];

    /** Script the next round-trip to resolve with `response`. */
    public EnqueueResponse(response: unknown): void {
        this.responders.push(() => response);
    }

    /** Script the next round-trip with a function that can inspect the request. */
    public EnqueueResponder(responder: WireResponder): void {
        this.responders.push(responder);
    }

    /** Script the next round-trip to reject with `error`. */
    public EnqueueError(error: Error): void {
        this.responders.push(() => {
            throw error;
        });
    }

    /** Consumes the next scripted responder. Called by FakeGraphQLClient.request(). */
    public NextResponse(document: string, variables: Record<string, unknown> | null | undefined): unknown {
        const responder = this.responders.shift();
        if (!responder) {
            throw new Error(`GraphQLWire: no scripted response for request:\n${document}`);
        }
        return responder(document, variables);
    }

    /** The most recently sent request. Throws if nothing was sent. */
    public get LastRequest(): CapturedGraphQLRequest {
        if (this.Requests.length === 0) {
            throw new Error('GraphQLWire: no requests have been sent');
        }
        return this.Requests[this.Requests.length - 1];
    }

    /** The most recently created client. Throws if none exists. */
    public get LastClient(): FakeGraphQLClient {
        if (this.Clients.length === 0) {
            throw new Error('GraphQLWire: no clients have been created');
        }
        return this.Clients[this.Clients.length - 1];
    }

    /** Convenience: the `input` member of the last request's variables. */
    public get LastInput(): unknown {
        return this.LastRequest.variables?.['input'];
    }

    /** Clears clients, requests, and any unconsumed scripted responses. */
    public Reset(): void {
        this.Clients = [];
        this.Requests = [];
        this.responders = [];
    }

    /** Number of scripted responses not yet consumed — assert 0 at test end to catch over-scripting. */
    public get PendingResponderCount(): number {
        return this.responders.length;
    }
}

/** The shared wire registry used by the fake client and by test assertions. */
export const GraphQLWire = new GraphQLWireRegistry();

/**
 * Drop-in runtime replacement for graphql-request's GraphQLClient. Captures the
 * constructor arguments (URL + headers) and every request/setHeader call.
 */
export class FakeGraphQLClient {
    public readonly Url: string;
    /** Live header map — constructor headers plus any later setHeader() calls. */
    public readonly Headers: Record<string, string>;

    constructor(url: string, options?: { headers?: Record<string, string> }) {
        this.Url = url;
        this.Headers = { ...(options?.headers ?? {}) };
        GraphQLWire.Clients.push(this);
    }

    public async request(
        document: string,
        variables?: Record<string, unknown> | null
    ): Promise<unknown> {
        GraphQLWire.Requests.push({
            document,
            variables,
            clientIndex: GraphQLWire.Clients.indexOf(this),
        });
        return GraphQLWire.NextResponse(document, variables);
    }

    public setHeader(key: string, value: string): void {
        this.Headers[key] = value;
    }
}

/**
 * Faithful stand-in for graphql-request's `gql` template tag, which simply interpolates
 * the template into a plain string. The provider relies on that interpolation to build
 * dynamic query/mutation names and field lists, so the fake must do the same (the old
 * `strings.join('')` mock silently DROPPED every interpolated expression).
 */
export function FakeGql(chunks: TemplateStringsArray, ...expressions: unknown[]): string {
    return chunks.reduce(
        (acc, chunk, i) => acc + chunk + (i < expressions.length ? String(expressions[i]) : ''),
        ''
    );
}
