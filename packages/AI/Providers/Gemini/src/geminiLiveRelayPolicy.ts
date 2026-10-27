/**
 * @fileoverview Gemini Live's half of MJAPI's realtime relay: the server writes the setup, the browser streams input.
 *
 * A browser cannot hold a Gemini Enterprise credential, so a client-direct Enterprise session runs through MJAPI's relay
 * (`/realtime/relay/<ticket>/…`; `IRealtimeRelayPolicy` in `@memberjunction/ai`). Enterprise also lets a client replace
 * the system instruction and tools mid-session (`system` turns, `contextUpdate`), so checking the browser's first frame
 * would lock nothing. This policy:
 *
 * - opens every upstream connection with the setup the server wrote (`BuildGeminiLiveSetup`), and reads only two things
 *   from the browser's setup: a resumption handle (the relay accepts only handles it forwarded to the session) and a
 *   request for audio only (a downgrade, never an upgrade);
 * - forwards only `realtimeInput` (audio, video, text, activity markers, `audioStreamEnd`), `clientContent` whose turns
 *   are all `user` (an empty `turnComplete` commit included) and `toolResponse`, in camelCase or snake_case, with known
 *   keys only and media of the types Gemini Live takes; it drops everything else under a short label the relay counts;
 * - finds resumption handles in server frames with a byte search before any parse (avatar video frames run to
 *   megabytes).
 *
 * Widening what passes lets a browser change the agent mid-session, so any widening is a security change.
 *
 * @module @memberjunction/ai-gemini
 * @author MemberJunction.com
 */

import type { LiveClientSetup } from '@google/genai';
import type { IRealtimeRelayPolicy, JSONObject, JSONValue, RealtimeRelayFrameVerdict, RealtimeRelayOpenIntent } from '@memberjunction/ai';
import { BuildGeminiLiveAudioOnlySetup } from './geminiLiveSetup';

/** What a {@link GeminiLiveRelayPolicy} needs for one relayed session. */
export interface GeminiLiveRelayPolicyOptions {
    /** The setup the server wrote with `BuildGeminiLiveSetup`. Every connection of the session opens with it. */
    Setup: LiveClientSetup;
    /**
     * Mints the upstream handshake's headers. Called on every upstream open, so a short-lived OAuth token (Gemini
     * Enterprise) is fresh for each connection. Omitted on the Developer API, whose key travels in the upstream URL.
     */
    UpstreamHeaders?: () => Promise<Record<string, string>>;
}

/**
 * The longest client message the policy reads, in UTF-16 code units. The relay closes on larger frames first (2 MiB of
 * bytes, never fewer code units), so this guards only a caller without that cap.
 */
const MAX_CLIENT_MESSAGE_CHARS = 2 * 1024 * 1024;

/** Microphone audio Gemini Live takes: 16-bit PCM at 16 kHz. */
const AUDIO_MIME_TYPES: ReadonlySet<string> = new Set(['audio/pcm;rate=16000']);

/** Images Gemini Live takes as video frames. */
const IMAGE_MIME_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png']);

/** Media a user turn may carry inline: the same audio and image types. */
const TURN_MIME_TYPES: ReadonlySet<string> = new Set([...AUDIO_MIME_TYPES, ...IMAGE_MIME_TYPES]);

/** The server message field that carries a resumption handle, searched for as bytes before a frame is parsed. */
const RESUMPTION_UPDATE_KEY = 'sessionResumptionUpdate';
const RESUMPTION_UPDATE_BYTES = Buffer.from(RESUMPTION_UPDATE_KEY, 'utf8');

/** Why an object's fields could not be read: not an object, a key outside the allowlist, or one field under both names. */
type FieldProblem = 'invalid' | 'unknown' | 'duplicate';

/** An object's fields under their camelCase names. */
type WireFields = Map<string, JSONValue>;

/** A camelCase field name in snake_case, the other spelling Google's JSON parser accepts. */
function snakeCase(camelName: string): string {
    return camelName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Maps each field's camelCase and snake_case wire names to its camelCase name. */
function wireNames(...camelNames: string[]): ReadonlyMap<string, string> {
    const names = new Map<string, string>();
    for (const name of camelNames) {
        names.set(name, name);
        names.set(snakeCase(name), name);
    }
    return names;
}

/** An object that may have no fields at all (an activity marker). */
const NO_FIELDS: ReadonlyMap<string, string> = new Map();

const MESSAGE_TYPES = wireNames('realtimeInput', 'clientContent', 'toolResponse');
const REALTIME_INPUT_FIELDS = wireNames('audio', 'video', 'text', 'activityStart', 'activityEnd', 'audioStreamEnd');
const BLOB_FIELDS = wireNames('data', 'mimeType');
const CLIENT_CONTENT_FIELDS = wireNames('turns', 'turnComplete');
const CONTENT_FIELDS = wireNames('role', 'parts');
const PART_FIELDS = wireNames('text', 'inlineData');
const TOOL_RESPONSE_FIELDS = wireNames('functionResponses');
const FUNCTION_RESPONSE_FIELDS = wireNames('id', 'name', 'response', 'scheduling', 'willContinue');

/** The value each function response field must hold. */
const FUNCTION_RESPONSE_CHECKS: ReadonlyMap<string, (value: JSONValue) => boolean> = new Map<string, (value: JSONValue) => boolean>([
    ['id', (value: JSONValue) => typeof value === 'string'],
    ['name', (value: JSONValue) => typeof value === 'string'],
    ['response', (value: JSONValue) => isJsonObject(value)],
    ['scheduling', (value: JSONValue) => typeof value === 'string'],
    ['willContinue', (value: JSONValue) => typeof value === 'boolean'],
]);

/**
 * The Gemini Live frame policy for one relayed session: it writes the setup, filters what the browser sends after it,
 * and finds the resumption handles Google sends (see the module notes).
 *
 * Drop labels (counted by the relay, never payload): `oversize`, `invalid`, `empty`, `multi-key`, `setup`,
 * `contextUpdate`, `unknown`, and `<type>.<reason>` for a `realtimeInput`, `clientContent` or `toolResponse` that fails
 * its checks (`invalid`, `unknown`, `duplicate`, `media-type`; `system`, `model`, `role` and `part` for turns).
 */
export class GeminiLiveRelayPolicy implements IRealtimeRelayPolicy {
    /** The minted setup as JSON: each connection parses its own copy, so nothing a connection does reaches another. */
    private readonly setupJson: string;
    private readonly upstreamHeaders?: () => Promise<Record<string, string>>;

    /**
     * @param options The minted setup and, on Gemini Enterprise, the header source.
     * @throws When the setup names no model.
     */
    constructor(options: GeminiLiveRelayPolicyOptions) {
        const model = options.Setup?.model;
        if (typeof model !== 'string' || model.length === 0) {
            throw new Error('GeminiLiveRelayPolicy: the setup names no model; write it with BuildGeminiLiveSetup.');
        }
        this.setupJson = JSON.stringify(options.Setup);
        this.upstreamHeaders = options.UpstreamHeaders;
    }

    /** The upstream handshake's headers for this connection: the header source's, or none. */
    public async UpstreamHeaders(): Promise<Record<string, string>> {
        return this.upstreamHeaders ? this.upstreamHeaders() : {};
    }

    /**
     * Reads the browser's setup (the connection's first frame): its resumption handle and whether it asks for audio
     * only. Nothing else in it is read. `null` when the frame is not a lone, well-formed `setup` message.
     *
     * @param firstClientFrame The browser's first text frame.
     */
    public ReadOpenIntent(firstClientFrame: string): RealtimeRelayOpenIntent | null {
        const setup = readBrowserSetup(firstClientFrame);
        if (!setup) {
            return null;
        }
        const handle = readResumeHandle(setup);
        return handle === undefined ? null : { ResumeHandle: handle, AudioOnly: asksForAudioOnly(setup) };
    }

    /**
     * The connection's one opening frame: the minted setup, with the browser's resumption handle on a resume and without
     * video output when the browser asked for audio only.
     *
     * @param intent What the first frame asked for, as {@link ReadOpenIntent} read it and the relay granted it.
     * @throws On a resume when the minted setup has resumption off (never opens a fresh session in its place).
     */
    public OpeningFrames(intent: RealtimeRelayOpenIntent): string[] {
        const minted = JSON.parse(this.setupJson) as LiveClientSetup;
        const setup = intent.AudioOnly ? BuildGeminiLiveAudioOnlySetup(minted) : minted;
        if (intent.ResumeHandle !== null) {
            if (!setup.sessionResumption) {
                throw new Error('GeminiLiveRelayPolicy: a resume was granted, but the minted setup has session resumption off.');
            }
            setup.sessionResumption = { ...setup.sessionResumption, handle: intent.ResumeHandle };
        }
        return [JSON.stringify({ setup })];
    }

    /**
     * Forwards a `realtimeInput`, a `clientContent` of `user` turns or a `toolResponse` that passes its checks, as JSON
     * re-serialized from what was checked (so a duplicate key or another parser difference cannot carry an unchecked
     * value through). Drops anything else, under a label (see the class notes).
     *
     * @param frame A client text frame after the first.
     */
    public FilterClientFrame(frame: string): RealtimeRelayFrameVerdict {
        if (frame.length > MAX_CLIENT_MESSAGE_CHARS) {
            return { Drop: 'oversize' };
        }
        const message = parseJsonObject(frame);
        if (!message) {
            return { Drop: 'invalid' };
        }
        const keys = Object.keys(message);
        if (keys.length !== 1) {
            return { Drop: keys.length === 0 ? 'empty' : 'multi-key' };
        }
        const problem = checkClientMessage(keys[0], message[keys[0]]);
        return problem ? { Drop: problem } : { Forward: JSON.stringify(message) };
    }

    /**
     * The resumption handle a server frame carries, else `null`. Text and binary frames alike (Google sends its JSON in
     * binary frames); a frame without the bytes `sessionResumptionUpdate` is never parsed. A handle counts only when
     * Google marks it resumable, as the browser client does.
     *
     * @param data The frame's bytes.
     * @param isBinary Whether it came as a binary frame (not needed: both kinds hold the same JSON).
     */
    public ObserveServerFrame(data: Uint8Array, isBinary: boolean): string | null {
        const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        if (!bytes.includes(RESUMPTION_UPDATE_BYTES)) {
            return null;
        }
        const update = parseJsonObject(bytes.toString('utf8'))?.[RESUMPTION_UPDATE_KEY];
        if (!isJsonObject(update) || update['resumable'] === false) {
            return null;
        }
        const handle = update['newHandle'];
        return typeof handle === 'string' && handle.length > 0 ? handle : null;
    }
}

// ── The browser's setup ─────────────────────────────────────────────────────────────────────────────

/** The `setup` body of a first frame that is a lone setup message, else `null`. */
function readBrowserSetup(frame: string): JSONObject | null {
    if (frame.length > MAX_CLIENT_MESSAGE_CHARS) {
        return null;
    }
    const message = parseJsonObject(frame);
    const keys = message ? Object.keys(message) : [];
    if (!message || keys.length !== 1 || keys[0] !== 'setup') {
        return null;
    }
    const setup = message['setup'];
    return isJsonObject(setup) ? setup : null;
}

/** The browser's resumption handle: a string, `null` for a fresh session, `undefined` when it is malformed. */
function readResumeHandle(setup: JSONObject): string | null | undefined {
    const resumption = readAliased(setup, 'sessionResumption');
    if (!resumption) {
        return undefined;
    }
    if (resumption.Value === undefined || resumption.Value === null) {
        return null;
    }
    if (!isJsonObject(resumption.Value)) {
        return undefined;
    }
    const handle = resumption.Value['handle'];
    if (handle === undefined || handle === null || handle === '') {
        return null;
    }
    return typeof handle === 'string' ? handle : undefined;
}

/** Whether the browser's setup asks for audio output only (`responseModalities` of AUDIO and nothing else). */
function asksForAudioOnly(setup: JSONObject): boolean {
    const generation = readAliased(setup, 'generationConfig')?.Value;
    if (!isJsonObject(generation)) {
        return false;
    }
    const modalities = readAliased(generation, 'responseModalities')?.Value;
    return (
        Array.isArray(modalities) &&
        modalities.length > 0 &&
        modalities.every((modality) => typeof modality === 'string' && modality.toUpperCase() === 'AUDIO')
    );
}

/** One field by its camelCase name or its snake_case name; `null` when both are present. */
function readAliased(value: JSONObject, camelName: string): { Value: JSONValue | undefined } | null {
    const snakeName = snakeCase(camelName);
    const hasCamel = Object.hasOwn(value, camelName);
    const hasSnake = snakeName !== camelName && Object.hasOwn(value, snakeName);
    if (hasCamel && hasSnake) {
        return null;
    }
    return { Value: hasCamel ? value[camelName] : hasSnake ? value[snakeName] : undefined };
}

// ── Client messages ─────────────────────────────────────────────────────────────────────────────────

/** Why a one-key client message is dropped, or `null` when it may pass. */
function checkClientMessage(key: string, body: JSONValue): string | null {
    switch (MESSAGE_TYPES.get(key)) {
        case 'realtimeInput':
            return prefixed('realtimeInput', checkRealtimeInput(body));
        case 'clientContent':
            return prefixed('clientContent', checkClientContent(body));
        case 'toolResponse':
            return prefixed('toolResponse', checkToolResponse(body));
        default:
            return droppedTypeLabel(key);
    }
}

/** The label for a message type that never passes: a second `setup`, a `contextUpdate`, or an unknown type. */
function droppedTypeLabel(key: string): string {
    if (key === 'setup') {
        return 'setup';
    }
    return key === 'contextUpdate' || key === 'context_update' ? 'contextUpdate' : 'unknown';
}

/** A message type's drop label (`realtimeInput.media-type`), or `null` when there is no problem. */
function prefixed(type: string, problem: string | null): string | null {
    return problem === null ? null : `${type}.${problem}`;
}

/** Realtime input: audio and video blobs of the allowed types, text, the two activity markers, and `audioStreamEnd`. */
function checkRealtimeInput(body: JSONValue): string | null {
    const fields = readFields(body, REALTIME_INPUT_FIELDS);
    if (typeof fields === 'string') {
        return fields;
    }
    for (const [name, value] of fields) {
        const problem = checkRealtimeField(name, value);
        if (problem) {
            return problem;
        }
    }
    return null;
}

/** One realtime input field, by its camelCase name. */
function checkRealtimeField(name: string, value: JSONValue): string | null {
    switch (name) {
        case 'audio':
            return checkBlob(value, AUDIO_MIME_TYPES);
        case 'video':
            return checkBlob(value, IMAGE_MIME_TYPES);
        case 'text':
            return typeof value === 'string' ? null : 'invalid';
        case 'audioStreamEnd':
            return typeof value === 'boolean' ? null : 'invalid';
        case 'activityStart':
        case 'activityEnd':
            return checkMarker(value);
        default:
            return 'unknown';
    }
}

/** An activity marker: an empty object (the SDK's `ActivityStart` and `ActivityEnd` have no fields). */
function checkMarker(value: JSONValue): string | null {
    const fields = readFields(value, NO_FIELDS);
    return typeof fields === 'string' ? fields : null;
}

/** Inline media: base64 `data` and a `mimeType` from `types`. */
function checkBlob(value: JSONValue, types: ReadonlySet<string>): string | null {
    const fields = readFields(value, BLOB_FIELDS);
    if (typeof fields === 'string') {
        return fields;
    }
    const mimeType = fields.get('mimeType');
    if (typeof mimeType !== 'string' || !types.has(mimeType)) {
        return 'media-type';
    }
    return typeof fields.get('data') === 'string' ? null : 'invalid';
}

/** Client content: `user` turns only (or none, for the `turnComplete` commit), and a boolean `turnComplete`. */
function checkClientContent(body: JSONValue): string | null {
    const fields = readFields(body, CLIENT_CONTENT_FIELDS);
    if (typeof fields === 'string') {
        return fields;
    }
    const turnComplete = fields.get('turnComplete');
    if (turnComplete !== undefined && typeof turnComplete !== 'boolean') {
        return 'invalid';
    }
    const turns = fields.get('turns');
    if (turns === undefined) {
        return null;
    }
    if (!Array.isArray(turns)) {
        return 'invalid';
    }
    for (const turn of turns) {
        const problem = checkUserTurn(turn);
        if (problem) {
            return problem;
        }
    }
    return null;
}

/** One turn: role `user` exactly, and parts of text or inline media of the allowed types. */
function checkUserTurn(turn: JSONValue): string | null {
    const fields = readFields(turn, CONTENT_FIELDS);
    if (typeof fields === 'string') {
        return fields;
    }
    const role = fields.get('role');
    if (role !== 'user') {
        return role === 'system' || role === 'model' ? role : 'role';
    }
    const parts = fields.get('parts');
    if (parts === undefined) {
        return null;
    }
    if (!Array.isArray(parts)) {
        return 'invalid';
    }
    for (const part of parts) {
        const problem = checkPart(part);
        if (problem) {
            return problem;
        }
    }
    return null;
}

/** One part of a user turn: `text`, or `inlineData` of an allowed type; any other kind of part is `part`. */
function checkPart(part: JSONValue): string | null {
    const fields = readFields(part, PART_FIELDS);
    if (typeof fields === 'string') {
        return fields === 'unknown' ? 'part' : fields;
    }
    const text = fields.get('text');
    if (text !== undefined && typeof text !== 'string') {
        return 'invalid';
    }
    const inline = fields.get('inlineData');
    return inline === undefined ? null : checkBlob(inline, TURN_MIME_TYPES);
}

/** A tool response: a non-empty list of function responses with the known fields only. */
function checkToolResponse(body: JSONValue): string | null {
    const fields = readFields(body, TOOL_RESPONSE_FIELDS);
    if (typeof fields === 'string') {
        return fields;
    }
    const responses = fields.get('functionResponses');
    if (!Array.isArray(responses) || responses.length === 0) {
        return 'invalid';
    }
    for (const response of responses) {
        const problem = checkFunctionResponse(response);
        if (problem) {
            return problem;
        }
    }
    return null;
}

/** One function response: `id`, `name`, `response` (an object), `scheduling`, `willContinue`, of the right types. */
function checkFunctionResponse(value: JSONValue): string | null {
    const fields = readFields(value, FUNCTION_RESPONSE_FIELDS);
    if (typeof fields === 'string') {
        return fields;
    }
    for (const [name, field] of fields) {
        if (!(FUNCTION_RESPONSE_CHECKS.get(name)?.(field) ?? false)) {
            return 'invalid';
        }
    }
    return null;
}

// ── JSON ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * An object's fields under their camelCase names, or the problem: not an object, a key outside `allowed`, or one field
 * under both of its names.
 */
function readFields(value: JSONValue | undefined, allowed: ReadonlyMap<string, string>): WireFields | FieldProblem {
    if (!isJsonObject(value)) {
        return 'invalid';
    }
    const fields: WireFields = new Map();
    for (const key of Object.keys(value)) {
        const name = allowed.get(key);
        if (name === undefined) {
            return 'unknown';
        }
        if (fields.has(name)) {
            return 'duplicate';
        }
        fields.set(name, value[key]);
    }
    return fields;
}

/** Parses text that should hold a JSON object; `null` for anything else. */
function parseJsonObject(text: string): JSONObject | null {
    try {
        const value = JSON.parse(text) as JSONValue;
        return isJsonObject(value) ? value : null;
    } catch {
        return null;
    }
}

function isJsonObject(value: JSONValue | undefined): value is JSONObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
