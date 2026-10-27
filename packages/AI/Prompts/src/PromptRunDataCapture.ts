import { cosmiconfigSync } from 'cosmiconfig';
import { LogWarning } from '@memberjunction/core';
import type { ChatMessage } from '@memberjunction/ai';
import {
    IsTemplateDataCaptureMode,
    MAX_TEMPLATE_DATA_SHAPE_KEYS,
    type StoredParallelExecutionInfo,
    type StoredPromptRunMessages,
    type TemplateDataCaptureMode,
    type TemplateDataObjectShape,
    type TemplateDataShape,
} from '@memberjunction/ai-core-plus';
import type { ReferencedVariablesResult } from '@memberjunction/templates';

/** Data key that carries the agent payload. Agent-run step rows already store the payload. */
export const CURRENT_PAYLOAD_DATA_KEY = '_CURRENT_PAYLOAD';

/** Capture mode when no call, prompt or server setting applies. */
export const DEFAULT_TEMPLATE_DATA_CAPTURE: TemplateDataCaptureMode = 'None';

/** The `aiPromptRuns` section of mj.config.cjs. */
export interface AIPromptRunsConfig {
    /** Server default capture mode: 'None', 'Referenced' or 'Full'. */
    templateDataCapture?: string;  // case-violation-ok-legacy-back-compat: mirrors the camelCase key in mj.config.cjs
}

/** Note stored when the capture step fails. It holds no error text and no data value. */
export const TEMPLATE_DATA_CAPTURE_FAILED_NOTE = 'Template data was not stored: the capture step failed. See the server log.';

/**
 * Picks the capture mode: the call override, then the first prompt setting in `promptSettings` (ordered
 * most specific prompt first), then the server default. A missing or invalid value falls through to the next one.
 */
export function ResolveTemplateDataCaptureMode(
    callOverride: string | null | undefined,
    promptSettings: readonly (string | null | undefined)[],
    serverDefault: TemplateDataCaptureMode,
): TemplateDataCaptureMode {
    if (IsTemplateDataCaptureMode(callOverride)) return callOverride;
    return promptSettings.find(IsTemplateDataCaptureMode) ?? serverDefault;
}

/** Reads `aiPromptRuns.templateDataCapture` from mj.config. A missing value gives 'None'; an invalid one logs a warning and gives 'None'. */
export function ReadServerTemplateDataCaptureDefault(searchFrom: string = process.cwd()): TemplateDataCaptureMode {
    let section: AIPromptRunsConfig | undefined;
    try {
        const result = cosmiconfigSync('mj', { searchStrategy: 'global' }).search(searchFrom);
        section = result && !result.isEmpty ? (result.config?.aiPromptRuns as AIPromptRunsConfig | undefined) : undefined;
    } catch (error) {
        LogWarning(`aiPromptRuns.templateDataCapture: mj.config could not be read (${error instanceof Error ? error.message : String(error)}); using '${DEFAULT_TEMPLATE_DATA_CAPTURE}'`);
        return DEFAULT_TEMPLATE_DATA_CAPTURE;
    }
    const value = section?.templateDataCapture;
    if (value === undefined || value === null) return DEFAULT_TEMPLATE_DATA_CAPTURE;
    if (IsTemplateDataCaptureMode(value)) return value;
    LogWarning(`aiPromptRuns.templateDataCapture '${String(value)}' is not None, Referenced or Full; using '${DEFAULT_TEMPLATE_DATA_CAPTURE}'`);
    return DEFAULT_TEMPLATE_DATA_CAPTURE;
}

const JSON_STRING_NEEDS_ESCAPE = /["\\\x00-\x1f\ud800-\udfff]/;
const objectByteLengthCache = new WeakMap<object, number>();

/** UTF-8 byte length of a value's JSON form; -1 when it cannot be serialized. */
function jsonByteLength(value: unknown, allowArrayDecompose: boolean = true): number {
    if (value === undefined) return 0;
    if (value === null) return 4;
    if (typeof value === 'boolean') return value ? 4 : 5;
    if (typeof value === 'number') return Number.isFinite(value) ? String(value).length : 4;
    if (typeof value === 'string') {
        if (!JSON_STRING_NEEDS_ESCAPE.test(value)) {
            return Buffer.byteLength(value, 'utf8') + 2;
        }
        return Buffer.byteLength(JSON.stringify(value), 'utf8');
    }
    if (typeof value === 'object') {
        const cached = objectByteLengthCache.get(value);
        if (cached !== undefined) {
            return cached;
        }
        if (allowArrayDecompose && Array.isArray(value)) {
            if (value.length === 0) {
                objectByteLengthCache.set(value, 2);
                return 2;
            }
            let sum = 2 + (value.length - 1);
            for (let i = 0; i < value.length; i++) {
                const elBytes = jsonByteLength(value[i], false);
                if (elBytes < 0) {
                    objectByteLengthCache.set(value, -1);
                    return -1;
                }
                sum += elBytes === 0 ? 4 : elBytes;
            }
            objectByteLengthCache.set(value, sum);
            return sum;
        }
        try {
            const json = JSON.stringify(value);
            const bytes = json === undefined ? 0 : Buffer.byteLength(json, 'utf8');
            objectByteLengthCache.set(value, bytes);
            return bytes;
        } catch {
            objectByteLengthCache.set(value, -1);
            return -1;
        }
    }
    try {
        const json = JSON.stringify(value);
        return json === undefined ? 0 : Buffer.byteLength(json, 'utf8');
    } catch {
        return -1;
    }
}

/**
 * True for a key/value object. False for null, a primitive, an array, or a built-in object such as a Date or a Map:
 * the capture code treats those as inputs with no keys.
 */
function isKeyedObject(value: unknown): value is Record<string, unknown> {
    return Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * Shape of one template input: top-level key names and value sizes, the largest 25 when there are more.
 * An input that is not a key/value object has no keys; its record gives the byte length of its whole JSON form.
 */
export function BuildTemplateDataObjectShape(input: unknown): TemplateDataObjectShape {
    if (!isKeyedObject(input)) {
        return { keyCount: 0, totalBytes: jsonByteLength(input), keys: {}, keysElided: false };
    }
    const keys = Object.keys(input);
    const keyCount = keys.length;
    if (keyCount === 0) {
        return { keyCount: 0, totalBytes: 0, keys: {} };
    }
    const elided = keyCount > MAX_TEMPLATE_DATA_SHAPE_KEYS;
    let totalBytes = 0;
    if (!elided) {
        const shapeKeys: Record<string, number> = {};
        for (let i = 0; i < keyCount; i++) {
            const k = keys[i];
            const size = jsonByteLength(input[k]);
            shapeKeys[k] = size;
            if (size > 0) totalBytes += size;
        }
        return { keyCount, totalBytes, keys: shapeKeys };
    }
    const sizes: [string, number][] = new Array(keyCount);
    for (let i = 0; i < keyCount; i++) {
        const k = keys[i];
        const size = jsonByteLength(input[k]);
        sizes[i] = [k, size];
        if (size > 0) totalBytes += size;
    }
    sizes.sort((a, b) => b[1] - a[1]);
    const shapeKeys: Record<string, number> = {};
    for (let i = 0; i < MAX_TEMPLATE_DATA_SHAPE_KEYS; i++) {
        shapeKeys[sizes[i][0]] = sizes[i][1];
    }
    return { keyCount, totalBytes, keys: shapeKeys, keysElided: true };
}

/** A copy of a key/value input without the agent payload key. Any other input, or one without the key, is returned as is. */
function withoutCurrentPayload(input: unknown): unknown {
    if (!isKeyedObject(input) || !Object.hasOwn(input, CURRENT_PAYLOAD_DATA_KEY)) return input;
    const copy = { ...input };
    delete copy[CURRENT_PAYLOAD_DATA_KEY];
    return copy;
}

/** A key/value input with only the keys in `names`. Any other input is returned as is: it has no keys to filter. */
function keepReferencedKeys(input: unknown, names: ReadonlySet<string>): unknown {
    return isKeyedObject(input) ? Object.fromEntries(Object.entries(input).filter(([key]) => names.has(key))) : input;
}

/** Inputs for {@link BuildStoredPromptRunMessages}. */
export interface StoredPromptRunMessagesInput {
    /** The resolved capture mode. */
    Mode: TemplateDataCaptureMode;
    /** The run's `data` (`AIPromptParams.data`). Normally an object, but callers such as the GraphQL API can pass any JSON value. */
    Data?: unknown;
    /** The run's `templateData` (`AIPromptParams.templateData`). Accepts any value, like `Data`. */
    TemplateData?: unknown;
    /** The messages the model received. */
    Messages: ChatMessage[];
    /** Variables the run's templates read. Called only in `Referenced` mode. */
    GetReferencedVariables: () => ReferencedVariablesResult;
    /** Parallel-execution summary of a consolidated parallel run. */
    ParallelExecution?: StoredParallelExecutionInfo;
}

/**
 * Builds the object stored in `AIPromptRun.Messages`. `_CURRENT_PAYLOAD` is never stored. `None` stores
 * a shape record, `Referenced` the keys the templates read (or everything, with a note, when the analysis
 * is incomplete), `Full` everything. An input that is not a key/value object has no keys: `None` records
 * only its size, and `Referenced` and `Full` store it as passed.
 */
export function BuildStoredPromptRunMessages(input: StoredPromptRunMessagesInput): StoredPromptRunMessages {
    const data = withoutCurrentPayload(input.Data);
    const templateData = withoutCurrentPayload(input.TemplateData);
    let dataCapture: TemplateDataCaptureMode = input.Mode;
    let dataCaptureNote: string | undefined;
    let dataShape: TemplateDataShape | undefined;
    let storedData: unknown;
    let storedTemplateData: unknown;

    if (input.Mode === 'None') {
        if (data !== undefined || templateData !== undefined) {
            dataShape = {};
            if (data !== undefined) dataShape.data = BuildTemplateDataObjectShape(data);
            if (templateData !== undefined) dataShape.templateData = BuildTemplateDataObjectShape(templateData);
        }
    } else if (input.Mode === 'Referenced' && (isKeyedObject(data) || isKeyedObject(templateData))) {
        const referenced = input.GetReferencedVariables();
        if (referenced.Complete) {
            storedData = keepReferencedKeys(data, referenced.Names);
            storedTemplateData = keepReferencedKeys(templateData, referenced.Names);
        } else {
            dataCapture = 'Full';
            dataCaptureNote = `Referenced capture stored all data: ${referenced.Reason ?? 'the template analysis was incomplete'}`;
            storedData = data;
            storedTemplateData = templateData;
        }
    } else {
        // Full, or Referenced with no key/value input to filter (so no analysis is needed)
        storedData = data;
        storedTemplateData = templateData;
    }

    // Assigned in this order so the large `messages` array is serialized last.
    const stored: Omit<StoredPromptRunMessages, 'messages'> = { dataCapture };
    if (dataCaptureNote !== undefined) stored.dataCaptureNote = dataCaptureNote;
    if (dataShape !== undefined) stored.dataShape = dataShape;
    if (storedData !== undefined) stored.data = storedData;
    if (storedTemplateData !== undefined) stored.templateData = storedTemplateData;
    if (input.ParallelExecution !== undefined) stored.parallelExecution = input.ParallelExecution;
    return { ...stored, messages: input.Messages };
}

/**
 * The object stored when the capture step fails: `None` with {@link TEMPLATE_DATA_CAPTURE_FAILED_NOTE}, the messages
 * and the parallel-execution summary, and no template data.
 */
export function BuildCaptureFailedPromptRunMessages(messages: ChatMessage[], parallelExecution?: StoredParallelExecutionInfo): StoredPromptRunMessages {
    const stored: Omit<StoredPromptRunMessages, 'messages'> = { dataCapture: 'None', dataCaptureNote: TEMPLATE_DATA_CAPTURE_FAILED_NOTE };
    if (parallelExecution !== undefined) stored.parallelExecution = parallelExecution;
    return { ...stored, messages };
}
