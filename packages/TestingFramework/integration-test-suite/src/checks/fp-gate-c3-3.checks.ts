/**
 * Gate G7.8 "C1 → C3.3": a prompt configured at temperature 0 reaches the Gemini, Vertex and Bedrock clients as 0,
 * 3 of 3, and a rejected parameter raises instead of being replaced. No external network and no database writes:
 * Gemini and Vertex requests go to a loopback endpoint that answers like the Gemini API (the real @google/genai
 * request body, sent by that one probe client only), Bedrock requests are stopped at an SDK middleware on the probe
 * client. Nothing process-wide is replaced, so other tests running in the same process are unaffected.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { GoogleGenAI } from '@google/genai';
import { ChatMessageRole, ChatParams, ParameterFidelityError } from '@memberjunction/ai';
import { GeminiLLM } from '@memberjunction/ai-gemini';
import { VertexLLM } from '@memberjunction/ai-vertex';
import { BedrockLLM } from '@memberjunction/ai-bedrock';
import { Assert, AssertEqual, IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';

/**
 * A captured request body, or its `generationConfig`. `unknown` values because the body is the vendor SDK's JSON,
 * whose shape belongs to the vendor; each check reads the one field it measures through a typeof-narrowed path.
 */
type CapturedJSON = Record<string, unknown>;

/** What one probe call sent and whether it raised. */
interface ProbeOutcome {
    /** The request bodies the client sent (0 when the call was refused before any request). */
    Bodies: CapturedJSON[];
    /** What the call raised; undefined when it returned. */
    Raised: Error | undefined;
}

/** A loopback HTTP endpoint that answers like the Gemini API and records each request body. One per probe call. */
class GeminiLoopback {
    private constructor(private readonly server: Server, public readonly BaseUrl: string, public readonly Bodies: CapturedJSON[]) {}

    /** Starts an endpoint on 127.0.0.1 with an ephemeral port. */
    public static async Start(): Promise<GeminiLoopback> {
        const bodies: CapturedJSON[] = [];
        const server = createServer((req, res) => { void GeminiLoopback.Answer(req, res, bodies); });
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => resolve());
        });
        const address: AddressInfo | string | null = server.address();
        if (address === null || typeof address === 'string') {
            server.close();
            throw new Error('The loopback endpoint has no TCP address.');
        }
        return new GeminiLoopback(server, `http://127.0.0.1:${address.port}`, bodies);
    }

    /** Stops the endpoint (and drops any kept-alive connection the SDK left open). */
    public async Stop(): Promise<void> {
        this.server.closeAllConnections();
        await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }

    /**
     * Records the request body and answers one Gemini candidate with an empty JSON object. A body that cannot be read
     * is answered 500, so the probe call fails visibly rather than the endpoint crashing the process.
     */
    protected static async Answer(req: IncomingMessage, res: ServerResponse, bodies: CapturedJSON[]): Promise<void> {
        try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
            }
            bodies.push(VendorRequestCapture.ParseObject(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
            res.writeHead(500, { 'content-type': 'text/plain' });
            res.end(`gate loopback could not read the request: ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
            candidates: [{ content: { role: 'model', parts: [{ text: '{}' }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }));
    }
}

/** Gemini's driver with an API-key client pointed at a loopback endpoint; the request body is the driver's own. */
class ProbeGemini extends GeminiLLM {
    constructor(private readonly probeBaseUrl: string) {
        super('probe-no-network');
    }

    protected override async createClient(): Promise<GoogleGenAI> {
        return new GoogleGenAI({ apiKey: 'probe-no-network', httpOptions: { baseUrl: this.probeBaseUrl } });
    }
}

/** Vertex's driver with an API-key client pointed at a loopback endpoint, so no Google auth is needed. */
class ProbeVertex extends VertexLLM {
    constructor(private readonly probeBaseUrl: string) {
        super(JSON.stringify({ project: 'probe', location: 'global' }));
    }

    protected override async createClient(): Promise<GoogleGenAI> {
        return new GoogleGenAI({ apiKey: 'probe-no-network', httpOptions: { baseUrl: this.probeBaseUrl } });
    }
}

/** The probe calls and their capture points: what a driver really sends, read before (or instead of) the network. */
class VendorRequestCapture {
    /** The Gemini model the probes call (one that takes temperature). */
    public static readonly GEMINI_MODEL = 'gemini-3.1-flash-lite';
    /** A Gemini model at 3.6 or later, where the driver no longer sends temperature. */
    public static readonly GEMINI_NO_SAMPLING_MODEL = 'gemini-3.8-flash';
    /** The Bedrock model the probes call (the anthropic family's InvokeModel body). */
    public static readonly BEDROCK_MODEL = 'anthropic.claude-3-haiku-20240307-v1:0';

    /** The probe call: one user message, JSON response, plus the parameters under test. */
    public static Params(model: string, extra: Partial<ChatParams> = {}): ChatParams {
        const params = new ChatParams();
        params.model = model;
        params.messages = [{ role: ChatMessageRole.user, content: 'Job Title: Affineur & Owner' }];
        params.responseFormat = 'JSON';
        return Object.assign(params, extra);
    }

    /** Sends one call through a Gemini-API driver whose client targets its own loopback endpoint; stops the endpoint after. */
    public static async ProbeGoogle(create: (baseUrl: string) => GeminiLLM, params: ChatParams): Promise<ProbeOutcome> {
        const endpoint = await GeminiLoopback.Start();
        try {
            const raised = await VendorRequestCapture.Raised(() => create(endpoint.BaseUrl).ChatCompletion(params));
            return { Bodies: endpoint.Bodies, Raised: raised };
        } finally {
            await endpoint.Stop();
        }
    }

    /** Sends one call through a Bedrock client whose first middleware step records the body and stops the call. */
    public static async ProbeBedrock(params: ChatParams): Promise<ProbeOutcome> {
        const bodies: CapturedJSON[] = [];
        const llm = new BedrockLLM('probe:probe', 'us-east-1');
        llm.Client.middlewareStack.add(() => async (args) => {
            const input = args.input;
            const body = input !== null && typeof input === 'object' && 'body' in input ? input.body : undefined;
            if (typeof body === 'string') {
                bodies.push(VendorRequestCapture.ParseObject(body));
            }
            throw new Error('captured by the C3.3 gate (no network)');
        }, { step: 'initialize', name: 'c33-capture' });
        const raised = await VendorRequestCapture.Raised(() => llm.ChatCompletion(params));
        return { Bodies: bodies, Raised: raised };
    }

    /** The temperature each client sends for a temperature-0 call (undefined when it did not send exactly one request with one). */
    public static async TemperaturesSentForZero(): Promise<Record<'Gemini' | 'Vertex' | 'Bedrock', number | undefined>> {
        const C = VendorRequestCapture;
        const [gemini, vertex, bedrock] = await Promise.all([
            C.ProbeGoogle((url) => new ProbeGemini(url), C.Params(C.GEMINI_MODEL, { temperature: 0, seed: 42 })),
            C.ProbeGoogle((url) => new ProbeVertex(url), C.Params(C.GEMINI_MODEL, { temperature: 0 })),
            C.ProbeBedrock(C.Params(C.BEDROCK_MODEL, { temperature: 0 })),
        ]);
        const single = (o: ProbeOutcome, read: (b: CapturedJSON) => number | undefined): number | undefined =>
            (o.Bodies.length === 1 ? read(o.Bodies[0]) : undefined);
        return {
            Gemini: single(gemini, (b) => C.NumberField(C.GenerationConfig(b), 'temperature')),
            Vertex: single(vertex, (b) => C.NumberField(C.GenerationConfig(b), 'temperature')),
            Bedrock: single(bedrock, (b) => C.NumberField(b, 'temperature')),
        };
    }

    /** A Gemini request body's `generationConfig`; undefined when absent. */
    public static GenerationConfig(body: CapturedJSON | undefined): CapturedJSON | undefined {
        const config = body?.generationConfig;
        return config !== null && typeof config === 'object' && !Array.isArray(config) ? { ...config } : undefined;
    }

    /** A numeric field of a captured object; undefined when absent or not a number. */
    public static NumberField(obj: CapturedJSON | undefined, field: string): number | undefined {
        const value = obj?.[field];
        return typeof value === 'number' ? value : undefined;
    }

    /** Runs a call; returns what it raised (undefined when it returned). */
    public static async Raised<T>(call: () => Promise<T>): Promise<Error | undefined> {
        try {
            await call();
            return undefined;
        } catch (e) {
            if (e instanceof Error) {
                return e;
            }
            throw e;
        }
    }

    /** Text as a JSON object; text that is not a JSON object is captured as empty, so the check reading it fails. */
    public static ParseObject(text: string): CapturedJSON {
        const parsed: unknown = JSON.parse(text); // `unknown`: narrowed to an object right below
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
    }
}

const C = VendorRequestCapture;

/**
 * The C1 → C3.3 gate's checks (deterministic tier, no database writes). Each check makes its own probe calls, so any
 * one of them can run alone and in any order.
 */
export const FpGateC33Checks: NamedCheck[] = [
    {
        Id: 'fp-gate-c3-3.G1', Name: 'C3.3 Gemini sends temperature 0 as 0',
        Fn: async () => {
            const o = await C.ProbeGoogle((url) => new ProbeGemini(url), C.Params(C.GEMINI_MODEL, { temperature: 0, seed: 42 }));
            AssertEqual(o.Bodies.length, 1, `one Gemini request (${o.Raised ? o.Raised.message : 'no error'})`);
            AssertEqual(C.NumberField(C.GenerationConfig(o.Bodies[0]), 'temperature'), 0, 'Gemini request temperature');
        },
    },
    {
        Id: 'fp-gate-c3-3.G2', Name: 'C3.3 Vertex sends temperature 0 as 0',
        Fn: async () => {
            const o = await C.ProbeGoogle((url) => new ProbeVertex(url), C.Params(C.GEMINI_MODEL, { temperature: 0 }));
            AssertEqual(o.Bodies.length, 1, `one Vertex request (${o.Raised ? o.Raised.message : 'no error'})`);
            AssertEqual(C.NumberField(C.GenerationConfig(o.Bodies[0]), 'temperature'), 0, 'Vertex request temperature');
        },
    },
    {
        Id: 'fp-gate-c3-3.G3', Name: 'C3.3 Bedrock sends temperature 0 as 0, and temperature 0 reaches 3 of 3 clients',
        Fn: async () => {
            const o = await C.ProbeBedrock(C.Params(C.BEDROCK_MODEL, { temperature: 0 }));
            AssertEqual(o.Bodies.length, 1, 'one Bedrock request');
            AssertEqual(C.NumberField(o.Bodies[0], 'temperature'), 0, 'Bedrock request temperature');
            const sent = await C.TemperaturesSentForZero();
            const reached = Object.entries(sent).filter(([, t]) => t === 0).map(([name]) => name);
            AssertEqual(reached.join(', '), 'Gemini, Vertex, Bedrock', `temperature 0 reached 3 of 3 (sent ${JSON.stringify(sent)})`);
        },
    },
    {
        Id: 'fp-gate-c3-3.G4', Name: 'C3.3 a rejected parameter raises instead of being replaced (strict call, Bedrock drops seed)',
        Fn: async () => {
            const o = await C.ProbeBedrock(C.Params(C.BEDROCK_MODEL, { temperature: 0, seed: 42, strictParameters: true }));
            const raised = o.Raised;
            Assert(raised instanceof ParameterFidelityError, `expected ParameterFidelityError, got ${raised ? raised.message : 'no error'}`);
            if (raised instanceof ParameterFidelityError) {
                AssertEqual(raised.Fidelity.Configured.Seed, 42, 'configured seed');
                AssertEqual(raised.Fidelity.WouldSend.Seed, null, 'the seed Bedrock would send');
            }
            AssertEqual(o.Bodies.length, 0, 'no request was sent');
        },
    },
    {
        Id: 'fp-gate-c3-3.G5', Name: 'C3.3 a Gemini model that no longer takes temperature is sent none, and a strict temperature-0 call to it raises',
        Fn: async () => {
            const plain = await C.ProbeGoogle((url) => new ProbeGemini(url), C.Params(C.GEMINI_NO_SAMPLING_MODEL, { temperature: 0 }));
            AssertEqual(plain.Bodies.length, 1, `one request for the non-strict call (${plain.Raised ? plain.Raised.message : 'no error'})`);
            const config = C.GenerationConfig(plain.Bodies[0]);
            AssertEqual(config?.responseMimeType, 'application/json', 'the request carries its generation config');
            Assert(config !== undefined && !('temperature' in config), `no temperature is sent to ${C.GEMINI_NO_SAMPLING_MODEL} (config ${JSON.stringify(config)})`);
            const strict = await C.ProbeGoogle((url) => new ProbeGemini(url),
                C.Params(C.GEMINI_NO_SAMPLING_MODEL, { temperature: 0, strictParameters: true }));
            const raised = strict.Raised;
            Assert(raised instanceof ParameterFidelityError, `expected ParameterFidelityError, got ${raised ? raised.message : 'no error'}`);
            if (raised instanceof ParameterFidelityError) {
                AssertEqual(raised.Fidelity.Configured.Temperature, 0, 'configured temperature');
                AssertEqual(raised.Fidelity.WouldSend.Temperature, null, `the temperature the driver would send to ${C.GEMINI_NO_SAMPLING_MODEL}`);
            }
            AssertEqual(strict.Bodies.length, 0, 'no request was sent for the strict call');
        },
    },
];

for (const c of FpGateC33Checks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
