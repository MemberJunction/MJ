#!/usr/bin/env node
// Live smoke for MJ#6403: a real Gemini Live call past Google's 10-minute cut, driven through the built
// GeminiRealtimeClient. Unit tests cannot show this bug: it needs a real 10-minute Google socket. This is the
// reproduction tool for the issue, not part of any test suite. It costs real API money and takes about 12 minutes.
//
//   MJ_VERBOSE=true node packages/AI/RealtimeClient/scripts/smoke/gemini-reconnect-memory.mjs \
//       --env-file /path/to/.env --model gemini-3.8-live --minutes 12
//
// Requires: a built RealtimeClient and Gemini provider (dist/), Node 20+, macOS `say` for the participant's voice.
// The key is AI_VENDOR_API_KEY__GeminiRealtime, from the environment or that one line of --env-file.
//
// Flags:
//   --model <id>                 Live model API name. Default gemini-3.8-live.
//   --minutes <n>                How long the call runs. Default 12.
//   --no-planned-move            Strips connectionLifetimeSeconds from the pact, so Google's 1011 is the trigger.
//   --tool-across-move           Declares a tool, holds its result across the move, sends it after the resume.
//   --settle-seconds <n>         Silence after the move before the first post-move input. Default 6.
//   --connection-lifetime <n>    Replaces the lifetime in the pact, to rehearse this script's flow in a short call.
//   --include-thoughts           Asks for thought summaries, on a model that has them, to show they stay out of the seed.
//   --env-file <path>            Where to read the key when it is not in the environment.
//
// What is real: the mint (GeminiRealtime.CreateClientSession), the driver, the SDK, the socket, Google. What is not:
// the browser audio. The driver's mic-capture and playback creation seams take a shim; PCM reaches the driver through
// the same callback the capture worklet calls. Exits non-zero, saying why, when a check fails.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { GeminiRealtime } from '../../../Providers/Gemini/dist/index.js';
import { GeminiRealtimeClient } from '../../dist/index.js';

const KEY_NAME = 'AI_VENDOR_API_KEY__GeminiRealtime';
const PLANNED_MOVE_MARGIN_S = 60; // REALTIME_PLANNED_MOVE_MARGIN_MS in the driver
const CHUNK_BYTES = 3200; // 100 ms of 16 kHz, 16-bit mono
const CHUNK_MS = 100;
const MAX_CATCH_UP_CHUNKS = 20; // after an event-loop stall, send at most this much backlog, as a real mic would
const SECONDS_BETWEEN_TURNS = 6; // the participant answers this long after the model's turn ends
const END_GRACE_S = 90; // on top of --minutes: past this the run is stuck, and fails
const DISCONNECT_TIMEOUT_MS = 5000;
const TOOL_ASK_LEAD_S = 30; // the tool is requested this long before the planned move
const MAX_TOOL_ASKS = 3;
const TOOL_REPLY_TIMEOUT_S = 45;

const TOOL_NAME = 'lookup_next_topic';
const TOOL_MARKER = /kestrel/i;
// Array-heavy, with brackets inside strings: the text form of a crossing result has to stay readable.
const TOOL_RESULT = {
    next_topic: 'Project Kestrel caching',
    topics: [
        { name: 'Project Kestrel caching', tags: ['cache', 'redis'], scores: [[1, 2], [3, 4]], note: 'see [section 2] of the brief' },
        { name: 'Queue back pressure', tags: ['queues'], scores: [[5, 6]], note: 'optional' },
        { name: 'Schema migrations', tags: [], scores: [], note: 'optional [skip if short on time]' },
    ],
};

const UTTERANCES = {
    hello: 'Hello. Yes, this is Alex. I am ready to start.',
    answer1: 'In my last project, I built a create, read, update, delete service in TypeScript. Next question, please.',
    answer2: 'I prefer small pull requests and code review by a teammate. Please ask the next question.',
    answer3: 'I would use a relational database with indexes. And I would write tests first. Please go to the next question.',
    repeat: 'Sorry, please repeat the question. Which question number are we on, and what is my name?',
    lookup: 'Please look up the next interview topic with your tool now.',
};
const ANSWERS = ['answer1', 'answer2', 'answer3'];

const SYSTEM_PROMPT =
    'You are a voice interviewer. First greet the participant and ask whether you are speaking with Alex. ' +
    'After they confirm, ask numbered interview questions about software engineering, one at a time, starting with "Question 1". ' +
    'After each answer, acknowledge it in one short sentence and ask the next numbered question. Never restart the interview.';
const TOOL_PROMPT =
    ` When the participant asks you to look up the next interview topic, call ${TOOL_NAME} at once and say nothing until it returns. ` +
    'When it returns, say the next_topic it gave, then ask the next numbered question about that topic.';

const GREETING = /\b(hello|hi|hey|welcome|good (morning|afternoon|evening)|nice to meet|am i speaking|are you alex|speaking with)\b/i;

// ── Log ───────────────────────────────────────────────────────────────────────────────────────

// Reset when the call starts, so the driver's 540 s reads as 540 s here too; rendering the voice takes seconds.
let startedAt = Date.now();
const secrets = [];
const logLines = [];

function elapsedSeconds() {
    return (Date.now() - startedAt) / 1000;
}

/** Removes the key and the token from any text about to be written: an SDK error can quote the socket URL. */
function redact(text) {
    let clean = text.replace(/access_token=[^&\s"']+/g, 'access_token=[redacted]').replace(/key=[^&\s"']+/g, 'key=[redacted]');
    for (const secret of secrets) {
        clean = clean.split(secret).join('[redacted]');
    }
    return clean;
}

const rawWrite = (line) => process.stdout.write(`${line}\n`);

function log(message) {
    const clean = redact(message);
    logLines.push({ At: elapsedSeconds(), Text: clean });
    rawWrite(`${elapsedSeconds().toFixed(1).padStart(7)}s ${clean}`);
}

// The driver's diag lines and the SDK's warnings go through console, so they get the same timestamps and redaction.
for (const method of ['log', 'info', 'warn', 'error']) {
    console[method] = (...parts) => log(parts.map((part) => (typeof part === 'string' ? part : part instanceof Error ? part.message : JSON.stringify(part))).join(' '));
}

/** A resumption handle is a credential to a session: only its hash goes in the log. */
function handleTag(handle) {
    return `#${createHash('sha256').update(handle).digest('hex').slice(0, 8)}(len ${handle.length})`;
}

// ── Inputs ────────────────────────────────────────────────────────────────────────────────────

function readOptions() {
    const { values } = parseArgs({
        options: {
            model: { type: 'string', default: 'gemini-3.8-live' },
            minutes: { type: 'string', default: '12' },
            'no-planned-move': { type: 'boolean', default: false },
            'tool-across-move': { type: 'boolean', default: false },
            'settle-seconds': { type: 'string', default: '6' },
            'connection-lifetime': { type: 'string' },
            'include-thoughts': { type: 'boolean', default: false },
            'env-file': { type: 'string' },
        },
    });
    const minutes = Number(values.minutes);
    const settleSeconds = Number(values['settle-seconds']);
    const lifetime = values['connection-lifetime'] === undefined ? undefined : Number(values['connection-lifetime']);
    if (!(minutes > 0 && minutes <= 28)) {
        throw new Error(`--minutes must be above 0 and at most 28 (the token lives 30): got ${values.minutes}`);
    }
    if (!(settleSeconds >= 0)) {
        throw new Error(`--settle-seconds must be 0 or more: got ${values['settle-seconds']}`);
    }
    if (lifetime !== undefined && !(lifetime > PLANNED_MOVE_MARGIN_S)) {
        throw new Error(`--connection-lifetime must be above the ${PLANNED_MOVE_MARGIN_S}s margin: got ${values['connection-lifetime']}`);
    }
    if (lifetime !== undefined && values['no-planned-move']) {
        throw new Error('--connection-lifetime and --no-planned-move contradict each other');
    }
    return {
        Model: values.model,
        Minutes: minutes,
        NoPlannedMove: values['no-planned-move'],
        ToolAcrossMove: values['tool-across-move'],
        SettleSeconds: settleSeconds,
        Lifetime: lifetime,
        IncludeThoughts: values['include-thoughts'],
        EnvFile: values['env-file'],
    };
}

/** The key from the environment, or that one line of the env file; nothing else in the file is kept. */
function readApiKey(envFile) {
    const fromEnv = process.env[KEY_NAME];
    if (fromEnv) {
        return fromEnv;
    }
    if (!envFile) {
        throw new Error(`no ${KEY_NAME} in the environment, and no --env-file to read it from`);
    }
    const line = readFileSync(envFile, 'utf8').split('\n').find((candidate) => candidate.startsWith(`${KEY_NAME}=`));
    const key = line?.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!key) {
        throw new Error(`no ${KEY_NAME} in ${envFile}`);
    }
    return key;
}

/** Speaks every utterance to 16 kHz PCM with macOS `say`; the temp directory goes on every path. */
function renderUtterances() {
    const dir = mkdtempSync(join(tmpdir(), 'mj-6403-smoke-'));
    try {
        return Object.fromEntries(Object.entries(UTTERANCES).map(([name, text]) => [name, renderOne(dir, name, text)]));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function renderOne(dir, name, text) {
    const path = join(dir, `${name}.wav`);
    execFileSync('say', ['-o', path, '--file-format=WAVE', '--data-format=LEI16@16000', text]);
    const wav = readFileSync(path);
    const dataAt = wav.indexOf(Buffer.from('data'));
    if (dataAt < 0) {
        throw new Error(`say wrote ${name}.wav with no data chunk`);
    }
    return wav.subarray(dataAt + 8);
}

/** Mints exactly as the server does, through the provider driver; only the pact's lifetime is edited, when asked. */
async function mintSession(options, apiKey) {
    const provider = new GeminiRealtime(apiKey);
    const session = await provider.CreateClientSession({
        Model: options.Model,
        SystemPrompt: options.ToolAcrossMove ? SYSTEM_PROMPT + TOOL_PROMPT : SYSTEM_PROMPT,
        ...(options.IncludeThoughts ? { Config: { includeThoughts: true } } : {}),
        ...(options.ToolAcrossMove
            ? {
                  Tools: [
                      {
                          Name: TOOL_NAME,
                          Description: 'Looks up the next interview topic. Returns the next topic and the list of topics.',
                          ParametersSchema: { type: 'object', properties: {} },
                      },
                  ],
              }
            : {}),
    });
    secrets.push(session.EphemeralToken);
    if (options.NoPlannedMove) {
        delete session.SessionConfig.connectionLifetimeSeconds;
    }
    if (options.Lifetime !== undefined) {
        session.SessionConfig.connectionLifetimeSeconds = options.Lifetime;
    }
    log(
        `minted: model=${session.Model} expiresAt=${session.ExpiresAt} connectionLifetimeSeconds=${session.SessionConfig.connectionLifetimeSeconds ?? 'none'} ` +
            `idleSignal=${session.SessionConfig.idleSignal} supportsBlocking=${session.SessionConfig.supportsBlocking} ` +
                `thinkingConfig=${JSON.stringify(session.SessionConfig.config?.thinkingConfig ?? null)}`
    );
    return session;
}

// ── The call's record ─────────────────────────────────────────────────────────────────────────

const run = {
    Connections: [], // { Number, SetupAt, ClosedAt, CloseCode, Outbound: [{ Kind, Text, At }] }
    Finals: [], // { At, Role, Text, IsThought }
    ToolCalls: [], // { At, CallID, AfterMove }
    Errors: [],
    Listening: false,
    MoveStartedAt: null,
    MoveDoneAt: null,
    TurnOpenAtMove: null,
    ToolCallPendingAtMove: false,
    NumberBeforeMove: null,
    AskedAt: null,
    NumberWhenAsked: null,
    UnpromptedAfterMove: [],
    UnpromptedWindowOpen: false,
    ToolResultSentAt: null,
    ToolAsks: 0,
    ToolReplySilent: false,
};

function assistantFinals(fromSeconds = 0, toSeconds = Infinity) {
    return run.Finals.filter((f) => f.Role === 'Assistant' && !f.IsThought && f.At >= fromSeconds && f.At < toSeconds);
}

const NUMBER_WORDS = buildNumberWords();

function buildNumberWords() {
    const ones = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const words = new Map(ones.map((word, index) => [word, index + 1]));
    tens.forEach((ten, tenIndex) => {
        words.set(ten, (tenIndex + 2) * 10);
        ones.slice(0, 9).forEach((one, oneIndex) => words.set(`${ten}-${one}`, (tenIndex + 2) * 10 + oneIndex + 1));
    });
    return words;
}

/** The number of the last "Question N" in the text, in digits or words; `null` when it names none. */
function lastQuestionNumber(text) {
    const matches = [...text.matchAll(/question\s+(?:number\s+)?(\d{1,3}|[a-z]+(?:[- ][a-z]+)?)/gi)];
    for (const match of matches.reverse()) {
        const named = match[1].toLowerCase().replace(' ', '-');
        const number = /^\d+$/.test(named) ? Number(named) : (NUMBER_WORDS.get(named) ?? NUMBER_WORDS.get(named.split('-')[0]));
        if (number) {
            return number;
        }
    }
    return null;
}

function lastNumberAsked() {
    return lastQuestionNumber(assistantFinals().map((f) => f.Text).join(' '));
}

/** Whether the text names this number, in digits or words. */
function mentionsNumber(text, number) {
    const lower = text.toLowerCase().replace(/(\w)\s+(one|two|three|four|five|six|seven|eight|nine)\b/g, '$1-$2');
    if (new RegExp(`\\b${number}\\b`).test(lower)) {
        return true;
    }
    return [...NUMBER_WORDS].some(([word, value]) => value === number && new RegExp(`\\b${word}\\b`).test(lower));
}

// ── The driver, with the browser's audio replaced ─────────────────────────────────────────────

/** The real driver through its creation seams: a mic that takes PCM, playback that counts, and a logged socket. */
class SmokeClient extends GeminiRealtimeClient {
    Mic = new SmokeMic();

    async createMicCapture(_micStream, onPcmChunk) {
        this.Mic.Start(onPcmChunk);
        return { Stop: () => this.Mic.Stop(), Rebind: () => {} };
    }

    createPlayback() {
        return { Enqueue: () => {}, Flush: () => {}, IsPlaying: false, Close: () => {} };
    }

    async connectLiveSession(args) {
        const connection = { Number: run.Connections.length + 1, SetupAt: null, ClosedAt: null, CloseCode: null, Outbound: [] };
        run.Connections.push(connection);
        const handle = args.Config.sessionResumption?.handle;
        log(`connection ${connection.Number}: opening, sessionResumption=${handle ? handleTag(handle) : '{} (no handle)'}`);
        const session = await super.connectLiveSession({
            ...args,
            OnMessage: (message) => {
                logInbound(connection, message);
                args.OnMessage(message);
            },
            OnClose: (event) => {
                connection.ClosedAt = elapsedSeconds();
                connection.CloseCode = event?.code ?? null;
                log(`connection ${connection.Number}: CLOSED code=${event?.code} reason="${event?.reason ?? ''}" wasClean=${event?.wasClean}`);
                args.OnClose(event);
            },
        });
        return wrapSession(session, connection);
    }
}

function logInbound(connection, message) {
    const prefix = `connection ${connection.Number}:`;
    if (message.setupComplete) {
        connection.SetupAt = elapsedSeconds();
        log(`${prefix} setupComplete`);
    }
    const update = message.sessionResumptionUpdate;
    if (update) {
        log(`${prefix} resumption update resumable=${update.resumable} newHandle=${update.newHandle ? handleTag(update.newHandle) : 'none'}`);
    }
    if (message.goAway) {
        log(`${prefix} goAway timeLeft=${message.goAway.timeLeft}`);
    }
    for (const call of message.toolCall?.functionCalls ?? []) {
        log(`${prefix} toolCall ${call.name} args=${JSON.stringify(call.args ?? {})}`);
    }
    const content = message.serverContent;
    if (content?.interrupted) {
        log(`${prefix} interrupted`);
    }
    if (content?.turnComplete) {
        log(`${prefix} turnComplete`);
    }
    const status = message.interactionStatus ?? message.interaction_status ?? content?.interactionStatus ?? content?.interaction_status;
    if (status) {
        log(`${prefix} interactionStatus ${status}`);
    }
}

/** The session the driver sends on, logging everything but mic audio, so the evidence shows what went on the wire. */
function wrapSession(session, connection) {
    const record = (kind, text) => {
        connection.Outbound.push({ Kind: kind, Text: text, At: elapsedSeconds() });
        log(`connection ${connection.Number}: OUTBOUND ${kind} ${text}`);
    };
    return {
        sendRealtimeInput: (params) => {
            if (params.audio) {
                // Counted by kind, not logged: ten lines a second.
                if (!connection.Outbound.some((o) => o.Kind === 'audio')) {
                    record('audio', '(first chunk; later chunks are not logged)');
                }
            } else {
                record('realtimeText', params.text ?? JSON.stringify(Object.keys(params)));
            }
            session.sendRealtimeInput(params);
        },
        sendClientContent: (params) => {
            const texts = (params.turns ?? []).map((turn) => `${turn.role}: ${(turn.parts ?? []).map((part) => part.text).join(' | ')}`);
            record('clientContent', `turnComplete=${params.turnComplete} turns=${JSON.stringify(texts)}`);
            session.sendClientContent(params);
        },
        sendToolResponse: (params) => {
            record('toolResponse', JSON.stringify(params.functionResponses));
            session.sendToolResponse(params);
        },
        close: () => session.close(),
    };
}

/** A continuous 16 kHz stream, silence unless an utterance is queued: a muted MJ mic streams silence too. */
class SmokeMic {
    onChunk = null;
    timer = null;
    sentChunks = 0;
    startedAt = 0;
    current = null;
    offset = 0;
    silence = Buffer.alloc(CHUNK_BYTES).toString('base64');

    get IsSpeaking() {
        return this.current !== null;
    }

    Say(pcm) {
        this.current = pcm;
        this.offset = 0;
    }

    Start(onChunk) {
        this.onChunk = onChunk;
        this.startedAt = Date.now();
        this.timer = setInterval(() => this.pump(), CHUNK_MS / 2);
    }

    Stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    pump() {
        const due = Math.floor((Date.now() - this.startedAt) / CHUNK_MS);
        this.sentChunks = Math.max(this.sentChunks, due - MAX_CATCH_UP_CHUNKS);
        while (this.sentChunks < due) {
            this.sentChunks++;
            this.onChunk(this.nextChunk());
        }
    }

    nextChunk() {
        if (!this.current) {
            return this.silence;
        }
        const chunk = Buffer.alloc(CHUNK_BYTES);
        this.current.copy(chunk, 0, this.offset, Math.min(this.offset + CHUNK_BYTES, this.current.length));
        this.offset += CHUNK_BYTES;
        if (this.offset >= this.current.length) {
            this.current = null;
        }
        return chunk.toString('base64');
    }
}

function createMicStream() {
    const track = { kind: 'audio', enabled: true, stop: () => {} };
    return { getTracks: () => [track], getAudioTracks: () => [track] };
}

// ── The participant ───────────────────────────────────────────────────────────────────────────

/** Answers some seconds after each model turn, as a person would. Holds no state the driver does not expose. */
class Participant {
    idleSince = Date.now();
    saidHello = false;
    answerNo = 0;
    lastUtteranceEndedAt = 0;
    wasSpeaking = false;

    constructor(client, audio, options) {
        this.client = client;
        this.audio = audio;
        this.options = options;
        this.toolAskAt = (options.Lifetime ?? 600) - PLANNED_MOVE_MARGIN_S - TOOL_ASK_LEAD_S;
    }

    /** The move finished: the settle time counts from here. */
    Moved() {
        this.idleSince = Date.now();
    }

    /** Whether the participant's words still wait for a reply, so a reply right after the move is not unprompted. */
    get AwaitsReply() {
        const lastReplyAt = assistantFinals().at(-1)?.AtMs ?? 0;
        return this.client.Mic.IsSpeaking || this.lastUtteranceEndedAt > lastReplyAt;
    }

    Tick() {
        if (this.wasSpeaking && !this.client.Mic.IsSpeaking) {
            this.lastUtteranceEndedAt = Date.now();
            this.idleSince = Date.now();
        }
        this.wasSpeaking = this.client.Mic.IsSpeaking;
        this.checkToolReplyTimeout();
        if (run.MoveStartedAt !== null && run.MoveDoneAt === null) {
            return;
        }
        if (this.client.Mic.IsSpeaking || (this.isModelBusy() && !run.ToolReplySilent)) {
            this.idleSince = Date.now();
            return;
        }
        const idleSeconds = (Date.now() - this.idleSince) / 1000;
        if (run.MoveDoneAt !== null) {
            this.afterMove(idleSeconds);
        } else {
            this.beforeMove(idleSeconds);
        }
    }

    isModelBusy() {
        return this.client.IsTurnOpen || this.client.IsBusy;
    }

    beforeMove(idleSeconds) {
        if (!this.saidHello) {
            if (elapsedSeconds() > 2) {
                this.saidHello = true;
                this.say('hello');
            }
            return;
        }
        if (idleSeconds < SECONDS_BETWEEN_TURNS) {
            return;
        }
        if (this.options.ToolAcrossMove && elapsedSeconds() >= this.toolAskAt && run.ToolCalls.length === 0 && run.ToolAsks < MAX_TOOL_ASKS) {
            run.ToolAsks++;
            this.say('lookup');
            return;
        }
        this.sayNextAnswer();
    }

    afterMove(idleSeconds) {
        const held = run.ToolCalls.find((call) => !call.AfterMove);
        if (this.options.ToolAcrossMove && held && run.ToolResultSentAt === null) {
            if (idleSeconds >= this.options.SettleSeconds) {
                this.sendHeldToolResult(held);
            }
            return;
        }
        const waitSeconds = run.AskedAt === null && !held ? this.options.SettleSeconds : SECONDS_BETWEEN_TURNS;
        if (idleSeconds < waitSeconds) {
            return;
        }
        if (run.AskedAt === null) {
            run.UnpromptedWindowOpen = false;
            run.AskedAt = elapsedSeconds();
            run.NumberWhenAsked = lastNumberAsked();
            this.say('repeat');
            return;
        }
        this.sayNextAnswer();
    }

    sendHeldToolResult(held) {
        run.UnpromptedWindowOpen = false;
        run.ToolResultSentAt = elapsedSeconds();
        log(`HOST sends the held result of ${TOOL_NAME} (call ${held.CallID}) after the resume`);
        this.client.SendToolResult(held.CallID, JSON.stringify(TOOL_RESULT));
        this.idleSince = Date.now();
    }

    /** A model that stays silent after the result would hold the turn open for good: that is a finding, and the call goes on. */
    checkToolReplyTimeout() {
        if (run.ToolResultSentAt === null || run.ToolReplySilent) {
            return;
        }
        const replied = assistantFinals(run.ToolResultSentAt).length > 0;
        if (!replied && elapsedSeconds() - run.ToolResultSentAt > TOOL_REPLY_TIMEOUT_S) {
            run.ToolReplySilent = true;
            log(`no reply to the held tool result in ${TOOL_REPLY_TIMEOUT_S}s`);
        }
    }

    sayNextAnswer() {
        this.say(ANSWERS[this.answerNo++ % ANSWERS.length]);
    }

    say(name) {
        log(`PARTICIPANT says (${name}): "${UTTERANCES[name]}"`);
        this.client.Mic.Say(this.audio[name]);
        this.wasSpeaking = true;
    }
}

// ── Events ────────────────────────────────────────────────────────────────────────────────────

function wireEvents(client, participant) {
    client.OnTranscript((transcript) => onTranscript(transcript));
    client.OnToolCall((call) => onToolCall(client, call));
    client.OnStateChange((state) => onState(client, participant, state));
    client.OnError((error) => {
        run.Errors.push(error);
        log(`CLIENT ERROR code=${error.Code ?? '-'} fatal=${error.Fatal} ${error.Message}`);
    });
    client.OnInterruption(() => log('CLIENT interruption'));
}

function onTranscript(transcript) {
    if (run.UnpromptedWindowOpen && transcript.Role === 'Assistant' && !transcript.IsThought && transcript.Text.trim()) {
        run.UnpromptedAfterMove.push(transcript.Text);
    }
    if (!transcript.IsFinal) {
        return;
    }
    run.Finals.push({ At: elapsedSeconds(), AtMs: Date.now(), Role: transcript.Role, Text: transcript.Text.trim(), IsThought: transcript.IsThought === true });
    const label = transcript.IsThought ? 'THOUGHT' : transcript.Role === 'User' ? 'USER' : 'AI';
    log(`${label} final: "${transcript.Text.trim()}"`);
}

function onToolCall(client, call) {
    const afterMove = run.MoveDoneAt !== null;
    run.ToolCalls.push({ At: elapsedSeconds(), CallID: call.CallID, AfterMove: afterMove });
    if (!afterMove) {
        log(`HOST holds the result of ${call.ToolName} (call ${call.CallID}) across the move`);
        return;
    }
    // Answered so the call goes on and the rest of the run is still evidence; the re-call itself fails the run.
    log(`HOST answers a re-call of ${call.ToolName} (call ${call.CallID}) made after the move`);
    client.SendToolResult(call.CallID, JSON.stringify(TOOL_RESULT));
}

function onState(client, participant, state) {
    log(`STATE ${state}`);
    if (state === 'listening' && !run.Listening) {
        run.Listening = true;
        return;
    }
    if (state === 'connecting' && run.Listening && run.MoveStartedAt === null) {
        run.MoveStartedAt = elapsedSeconds();
        run.TurnOpenAtMove = client.IsTurnOpen;
        run.ToolCallPendingAtMove = run.ToolCalls.length > 0;
        return;
    }
    if (state === 'listening' && run.MoveStartedAt !== null && run.MoveDoneAt === null) {
        run.MoveDoneAt = elapsedSeconds();
        run.NumberBeforeMove = lastNumberAsked();
        run.UnpromptedWindowOpen = !participant.AwaitsReply;
        log(`MOVE done: last question before it = ${run.NumberBeforeMove}, turnOpenAtStart=${run.TurnOpenAtMove}, unprompted-reply window ${run.UnpromptedWindowOpen ? 'open' : 'skipped (the participant is owed a reply)'}`);
        participant.Moved();
    }
}

// ── Checks ────────────────────────────────────────────────────────────────────────────────────

function findLine(pattern) {
    return logLines.find((line) => pattern.test(line.Text));
}

/** Every check of the run: the driver's lines in order, then what the model actually said. */
function evaluate(options) {
    const failures = [];
    const check = (passed, reason) => {
        if (!passed) {
            failures.push(reason);
        }
    };
    checkTrigger(options, check);
    if (run.MoveDoneAt === null) {
        check(false, 'the session never finished a move to a second connection');
        return failures;
    }
    checkSeed(check);
    checkContent(options, check);
    if (options.ToolAcrossMove) {
        checkToolAcrossMove(check);
    }
    for (const error of run.Errors) {
        check(false, `client error ${error.Code ?? ''}: ${error.Message}`);
    }
    return failures;
}

function checkTrigger(options, check) {
    if (options.NoPlannedMove) {
        check(!findLine(/planned move armed/), 'a planned move was armed although the pact names no lifetime');
        const first = run.Connections[0];
        check(first?.CloseCode === 1011, `expected Google's close 1011 on the first connection, got ${first?.CloseCode ?? 'no close'}`);
        check(first?.ClosedAt !== null && first?.ClosedAt >= 570 && first?.ClosedAt <= 630, `expected the close at about 600 s, got ${first?.ClosedAt ?? 'none'}`);
        check(!!findLine(/reconnecting \(connection-lost\)/), 'no "reconnecting (connection-lost)" line');
        return;
    }
    const moveAt = (options.Lifetime ?? 600) - PLANNED_MOVE_MARGIN_S;
    const armed = findLine(new RegExp(`planned move armed at ${moveAt}s`));
    check(!!armed, `no "planned move armed at ${moveAt}s" line`);
    if (run.MoveStartedAt === null) {
        return;
    }
    check(run.MoveStartedAt >= moveAt, `the move started at ${run.MoveStartedAt.toFixed(1)} s, before ${moveAt} s`);
    check(!!findLine(/reconnecting \(connection-ending\)/), 'no "reconnecting (connection-ending)" line: the planned move did not lead');
    check(run.Connections[0]?.CloseCode !== 1011 || run.Connections[0]?.ClosedAt > run.MoveDoneAt, 'Google cut the first connection before the planned move finished');
    // A pending tool call keeps its turn open by design, so that run moves at the deadline, not at a boundary.
    check(options.ToolAcrossMove || run.TurnOpenAtMove === false, 'the planned move started with a turn open');
}

function checkSeed(check) {
    const seedLine = findLine(/seeded \d+ entries \(chars \d+, dropped \d+\)/);
    check(!!seedLine, 'no "seeded N entries" line');
    if (seedLine) {
        check(/dropped 0\)/.test(seedLine.Text), `the seed dropped entries: ${seedLine.Text}`);
        check(seedLine.At >= run.MoveStartedAt, 'the seed line comes before the move');
    }
    const second = run.Connections[1];
    const firstOut = second?.Outbound[0];
    check(firstOut?.Kind === 'clientContent', `the second connection's first client message is ${firstOut?.Kind ?? 'none'}, not the seed`);
    check(!findLine(/resume-seed-failed/), 'resume-seed-failed reported');
    check(run.Connections.length === 2, `expected 2 connections, saw ${run.Connections.length}`);
    for (const thought of run.Finals.filter((f) => f.IsThought)) {
        check(!firstOut?.Text.includes(thought.Text), `a thought is in the seed: "${thought.Text.slice(0, 60)}"`);
    }
}

function checkContent(options, check) {
    check(run.NumberBeforeMove !== null && run.NumberBeforeMove >= 2, `the model was on question ${run.NumberBeforeMove} before the move: too little to show memory`);
    check(run.AskedAt !== null, 'the run ended before the participant asked the question after the move');
    check(run.UnpromptedAfterMove.length === 0, `unprompted reply right after the move: "${run.UnpromptedAfterMove.join('').slice(0, 120)}"`);
    const afterMove = assistantFinals(run.MoveDoneAt);
    for (const final of afterMove) {
        check(!GREETING.test(final.Text), `a greeting after the move: "${final.Text}"`);
        check(lastQuestionNumber(final.Text) !== 1, `the interview restarted after the move: "${final.Text}"`);
    }
    if (run.AskedAt === null) {
        return;
    }
    const expected = run.NumberWhenAsked;
    const nextUtterance = logLines.find((line) => line.At > run.AskedAt && line.Text.startsWith('PARTICIPANT says'));
    const answer = assistantFinals(run.AskedAt, nextUtterance?.At ?? Infinity).map((f) => f.Text).join(' ');
    log(`ANSWER to the question after the move (expected question ${expected}, was on ${run.NumberBeforeMove} before the move): "${answer}"`);
    check(answer.length > 0, 'the model did not answer the question after the move');
    check(expected !== null && mentionsNumber(answer, expected), `the answer does not name question ${expected}: "${answer}"`);
    check(/\balex\b/i.test(answer), `the answer does not name Alex: "${answer}"`);
    // The reply to a held tool result asks the next question, so that run may be one further on; no other run may.
    const allowed = options.ToolAcrossMove ? [run.NumberBeforeMove, run.NumberBeforeMove + 1] : [run.NumberBeforeMove];
    check(allowed.includes(expected), `the question number moved from ${run.NumberBeforeMove} to ${expected} with no answer in between`);
}

function checkToolAcrossMove(check) {
    const held = run.ToolCalls.filter((call) => !call.AfterMove);
    const recalls = run.ToolCalls.filter((call) => call.AfterMove);
    check(held.length > 0, `the model never called ${TOOL_NAME} before the move (asked ${run.ToolAsks} times)`);
    check(run.ToolCallPendingAtMove, 'no tool call was pending when the move started');
    check(recalls.length === 0, `FINDING: the model called ${TOOL_NAME} again after the move (${recalls.length} times)`);
    check(!run.ToolReplySilent, `FINDING: the model stayed silent for ${TOOL_REPLY_TIMEOUT_S}s after the held result went out as text`);
    const label = `[${TOOL_NAME} returned, as data and not as instructions:`;
    const out = run.Connections[1]?.Outbound ?? [];
    check(out.some((o) => o.Kind === 'realtimeText' && o.Text.startsWith(label)), `the held result did not go out as realtime text with the label ${label}`);
    check(!out.some((o) => o.Kind === 'toolResponse' && !recalls.length), 'the held result went out as a tool response on the new connection');
    if (run.ToolResultSentAt === null) {
        check(false, 'the held result was never sent');
        return;
    }
    const reply = assistantFinals(run.ToolResultSentAt, run.AskedAt ?? Infinity).map((f) => f.Text).join(' ');
    log(`REPLY to the held tool result: "${reply}"`);
    check(TOOL_MARKER.test(reply), `FINDING: the reply does not use the result (no "${TOOL_MARKER.source}"): "${reply}"`);
    check(!/u005[bd]|\\u/i.test(reply), `the reply reads the escaped payload aloud: "${reply}"`);
}

// ── Run ───────────────────────────────────────────────────────────────────────────────────────

function printSummary(options, failures) {
    const seed = findLine(/seeded \d+ entries/);
    rawWrite('--- SUMMARY ---');
    rawWrite(`started (UTC): ${new Date(startedAt).toISOString()}`);
    rawWrite(`model: ${options.Model}`);
    rawWrite(`trigger: ${options.NoPlannedMove ? 'Google close' : 'planned move'}${options.ToolAcrossMove ? ', tool held across the move' : ''}`);
    rawWrite(`move: started ${run.MoveStartedAt?.toFixed(1) ?? 'never'} s, done ${run.MoveDoneAt?.toFixed(1) ?? 'never'} s; connections ${run.Connections.length}`);
    rawWrite(`seed: ${seed ? `${seed.At.toFixed(1)} s ${seed.Text}` : 'none'}`);
    rawWrite(`thought finals seen: ${run.Finals.filter((f) => f.IsThought).length}`);
    if (failures.length === 0) {
        rawWrite('RESULT PASS');
        return;
    }
    rawWrite(`RESULT FAIL (${failures.length})`);
    failures.forEach((failure) => rawWrite(`  - ${redact(failure)}`));
}

/** The client of the call in progress, for the paths that end the run from outside it: a signal, the time limit. */
let activeClient = null;

/** Ends the call and resolves to the failures; the client is disconnected on every path, under a time limit. */
async function runCall(options) {
    const apiKey = readApiKey(options.EnvFile);
    secrets.push(apiKey);
    const audio = renderUtterances();
    const session = await mintSession(options, apiKey);
    const client = new SmokeClient();
    activeClient = client;
    const participant = new Participant(client, audio, options);
    wireEvents(client, participant);
    let ticker = null;
    try {
        startedAt = Date.now();
        await client.Connect(session, createMicStream());
        await new Promise((resolve) => {
            const endAt = options.Minutes * 60;
            ticker = setInterval(() => {
                const fatal = run.Errors.some((error) => error.Fatal);
                if (elapsedSeconds() >= endAt || fatal) {
                    resolve();
                    return;
                }
                participant.Tick();
            }, 500);
        });
        return evaluate(options);
    } finally {
        clearInterval(ticker);
        activeClient = null;
        await disconnectWithin(client);
    }
}

async function disconnectWithin(client) {
    let timer = null;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => {
            log(`Disconnect did not finish in ${DISCONNECT_TIMEOUT_MS} ms`);
            resolve();
        }, DISCONNECT_TIMEOUT_MS);
    });
    try {
        await Promise.race([client.Disconnect(), timeout]);
    } catch (err) {
        log(`Disconnect failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
        clearTimeout(timer);
    }
}

async function exitWith(options, failures) {
    if (activeClient) {
        const client = activeClient;
        activeClient = null;
        await disconnectWithin(client);
    }
    if (options) {
        printSummary(options, failures);
    } else {
        rawWrite(`RESULT FAIL\n  - ${redact(failures.join('; '))}`);
    }
    process.exit(failures.length === 0 ? 0 : 1);
}

async function main() {
    let options = null;
    try {
        options = readOptions();
        // A hang anywhere (a Connect that never settles, a stuck Disconnect) still ends the run, and says so.
        setTimeout(() => void exitWith(options, [`the run passed its limit of ${options.Minutes * 60 + END_GRACE_S} s`]), (options.Minutes * 60 + END_GRACE_S) * 1000).unref();
        await exitWith(options, await runCall(options));
    } catch (err) {
        await exitWith(options, [`the run could not finish: ${err instanceof Error ? err.message : String(err)}`]);
    }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => void exitWith(null, [`stopped by ${signal}`]));
}

await main();
