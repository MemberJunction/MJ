import type { ChatMessage } from '@memberjunction/ai';
import type { MJAIPromptEntity } from '@memberjunction/core-entities';

/**
 * Which template inputs (`data`, `templateData`) a prompt run stores in `AIPromptRun.Messages`:
 * - `None`: their shape only (top-level keys and byte sizes)
 * - `Referenced`: only the keys the run's templates read
 * - `Full`: everything that was passed
 */
export type TemplateDataCaptureMode = NonNullable<MJAIPromptEntity['TemplateDataCapture']>;

/** Every capture mode, as keys. A mode that CodeGen adds fails the build until it is listed here. */
const LISTED_TEMPLATE_DATA_CAPTURE_MODES: Record<TemplateDataCaptureMode, true> = { None: true, Referenced: true, Full: true };

/** Every capture mode. */
export const TEMPLATE_DATA_CAPTURE_MODES: readonly TemplateDataCaptureMode[] = Object.keys(LISTED_TEMPLATE_DATA_CAPTURE_MODES) as TemplateDataCaptureMode[];

/** True when `value` is one of {@link TEMPLATE_DATA_CAPTURE_MODES} (case-sensitive). */
export function IsTemplateDataCaptureMode(value: string | null | undefined): value is TemplateDataCaptureMode {
    return value != null && (TEMPLATE_DATA_CAPTURE_MODES as readonly string[]).includes(value);
}

/** Most top-level keys a shape record lists per object; the same limit as the action log's redaction record. */
export const MAX_TEMPLATE_DATA_SHAPE_KEYS = 25;

/**
 * Shape of one template input: key names and sizes, never values. An input that is not a key/value
 * object (a string, number, boolean, null or array) has no keys.
 */
export interface TemplateDataObjectShape {
    /** Number of top-level keys; 0 for an input that is not a key/value object. */
    keyCount: number; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    /**
     * Sum of the UTF-8 JSON byte lengths of all top-level values (values that cannot be serialized count as 0).
     * For an input that is not a key/value object: the UTF-8 byte length of its JSON form, or -1 when it cannot be serialized.
     */
    totalBytes: number; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    /** Top-level key → UTF-8 byte length of its value's JSON form; -1 when the value cannot be serialized. */
    keys: Record<string, number>; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    /** True when `keys` lists only the {@link MAX_TEMPLATE_DATA_SHAPE_KEYS} largest values. */
    keysElided?: boolean; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
}

/** Shapes of a run's template inputs. An input the caller did not pass has no entry. */
export interface TemplateDataShape {
    data?: TemplateDataObjectShape; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    templateData?: TemplateDataObjectShape; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
}

/** Parallel-execution summary stored on a consolidated (`ParallelParent`) prompt run. */
export interface StoredParallelExecutionInfo {
    parallelizationMode: MJAIPromptEntity['ParallelizationMode']; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    totalTasks: number; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    successfulTasks: number; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    failedTasks: number; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    selectedTaskId: string; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    executionGroups: number[]; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
}

/** The JSON object `AIPromptRunner` writes to `AIPromptRun.Messages`. */
export interface StoredPromptRunMessages {
    /** The capture mode applied to this run. */
    dataCapture: TemplateDataCaptureMode; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    /**
     * Why the stored data differs from what the requested mode stores: a `Referenced` run stored as `Full`,
     * or a run whose capture step failed (stored as `None`, with no shape).
     */
    dataCaptureNote?: string; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    /** Set in `None` mode when the caller passed `data` or `templateData`. */
    dataShape?: TemplateDataShape; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    /**
     * Set in `Referenced` and `Full` mode when the caller passed `data`. Normally an object; a caller can
     * pass any JSON value, and a value that is not a key/value object is stored as passed.
     */
    data?: unknown; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    /** Set in `Referenced` and `Full` mode when the caller passed `templateData`. Stored like `data`. */
    templateData?: unknown; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    /** Set on consolidated parallel runs. */
    parallelExecution?: StoredParallelExecutionInfo; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
    /** The messages the model received. */
    messages: ChatMessage[]; // case-violation-ok-legacy-back-compat: stored JSON key in AIPromptRun.Messages
}
