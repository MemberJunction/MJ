import {
    RichTextPasteImageEvent,
    RichTextPathChangeEvent,
    RichTextUndoStateChangeEvent,
    RichTextWillPasteEvent,
} from '../rich-text-editor.types';

/**
 * The engine's event surface, typed end to end.
 *
 * Each key is an event name; its value is the payload handlers receive. `void` payloads are
 * notifications with nothing to say beyond "this happened".
 */
export interface RichTextEngineEventMap {
    /** The document changed through user action or a command. Not fired for `SetHTML`. */
    input: void;
    /** The selection moved. Fired on every selection change, structurally different or not. */
    select: void;
    /** The selection moved to a structurally different position. */
    pathChange: RichTextPathChangeEvent;
    /** What Undo/Redo would do has changed. */
    undoStateChange: RichTextUndoStateChangeEvent;
    focus: void;
    blur: void;
    /** Paste, after sanitization, before insertion. Cancelable. */
    willPaste: RichTextWillPasteEvent;
    /** An image arrived on the clipboard. The host decides what to do with it. */
    pasteImage: RichTextPasteImageEvent;
}

/** Names of the events the engine can fire. */
export type RichTextEngineEventName = keyof RichTextEngineEventMap;

/** A handler for one event. */
export type RichTextEngineEventHandler<K extends RichTextEngineEventName> = (
    payload: RichTextEngineEventMap[K],
) => void;

/**
 * A minimal typed emitter.
 *
 * Handler exceptions are caught and routed to `onError` rather than escaping into the
 * engine's own event handling — a throwing toolbar listener must not leave the document
 * half-mutated or a keystroke half-processed.
 */
export class RichTextEventEmitter {
    private readonly handlers = new Map<RichTextEngineEventName, Set<(payload: unknown) => void>>();

    constructor(private readonly onError: (error: unknown) => void) {}

    public On<K extends RichTextEngineEventName>(name: K, handler: RichTextEngineEventHandler<K>): void {
        let set = this.handlers.get(name);
        if (!set) {
            set = new Set();
            this.handlers.set(name, set);
        }
        set.add(handler as (payload: unknown) => void);
    }

    public Off<K extends RichTextEngineEventName>(name: K, handler: RichTextEngineEventHandler<K>): void {
        this.handlers.get(name)?.delete(handler as (payload: unknown) => void);
    }

    public Emit<K extends RichTextEngineEventName>(name: K, payload: RichTextEngineEventMap[K]): void {
        const set = this.handlers.get(name);
        if (!set) {
            return;
        }
        for (const handler of Array.from(set)) {
            try {
                handler(payload);
            } catch (error) {
                this.onError(error);
            }
        }
    }

    public RemoveAll(): void {
        this.handlers.clear();
    }
}
