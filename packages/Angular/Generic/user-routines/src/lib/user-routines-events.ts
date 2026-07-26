/**
 * User Routines Event System.
 *
 * Follows the Before/After cancelable event idiom used across MJ generic packages
 * (ng-trees / entity-data-grid / ng-conversations): `Before*` events expose a
 * mutable `Cancel` flag the consumer can set synchronously to veto the operation;
 * `After*` events are informational.
 */
import type { MJUserRoutineEntity } from '@memberjunction/core-entities';

/** Base class for all User Routine events. */
export class UserRoutineEventArgs {
    /** The routine involved in the event. For BeforeRoutineCreated this is the not-yet-saved entity. */
    readonly Routine: MJUserRoutineEntity;

    /** Timestamp when the event was raised. */
    readonly Timestamp: Date;

    constructor(routine: MJUserRoutineEntity) {
        this.Routine = routine;
        this.Timestamp = new Date();
    }
}

/** Base class for cancelable (Before) events. */
export class CancelableUserRoutineEventArgs extends UserRoutineEventArgs {
    /** Set to true to cancel the operation. */
    Cancel: boolean = false;

    /** Optional reason for cancellation (for logging/debugging). */
    CancelReason?: string;
}

/** Raised before a NEW routine is saved for the first time. Cancelable. */
export class BeforeRoutineCreatedEventArgs extends CancelableUserRoutineEventArgs {}

/** Raised after a new routine (and its recipients) was persisted. */
export class AfterRoutineCreatedEventArgs extends UserRoutineEventArgs {}

/** Raised before a routine's Status is toggled (pause OR resume). Cancelable. */
export class BeforeRoutinePausedEventArgs extends CancelableUserRoutineEventArgs {
    /** The status the routine will move to if the operation proceeds. */
    readonly NewStatus: MJUserRoutineEntity['Status'];

    constructor(routine: MJUserRoutineEntity, newStatus: MJUserRoutineEntity['Status']) {
        super(routine);
        this.NewStatus = newStatus;
    }
}

/** Raised after a routine's Status toggle was persisted. */
export class AfterRoutinePausedEventArgs extends UserRoutineEventArgs {
    /** The status the routine now has. */
    readonly NewStatus: MJUserRoutineEntity['Status'];

    constructor(routine: MJUserRoutineEntity, newStatus: MJUserRoutineEntity['Status']) {
        super(routine);
        this.NewStatus = newStatus;
    }
}

/** Raised before a routine is queued to run now (NextRunAt = now). Cancelable. */
export class BeforeRoutineRunNowEventArgs extends CancelableUserRoutineEventArgs {}

/** Raised after a routine was queued to run now. */
export class AfterRoutineRunNowEventArgs extends UserRoutineEventArgs {}

/** Raised before a routine (and its recipients) is deleted. Cancelable. */
export class BeforeRoutineDeletedEventArgs extends CancelableUserRoutineEventArgs {}

/** Raised after a routine was deleted. */
export class AfterRoutineDeletedEventArgs extends UserRoutineEventArgs {}

/** Informational: the user selected a routine (opened its history / detail). */
export class RoutineSelectedEventArgs extends UserRoutineEventArgs {}

/**
 * Informational: the user asked to open the execution record linked to a run
 * (Agent Run / Prompt Run / Action Execution Log). The host owns navigation —
 * Generic components never touch the Router.
 */
/**
 * Raised when the user opens a routine's dedicated conversation (the Application-scoped
 * thread the dispatcher appends each Agent run to). The host decides how to present it —
 * the conversations surface selects it in chat; other hosts may navigate.
 */
export class ConversationOpenedEventArgs {
    /** The conversation to open. */
    readonly ConversationID: string;

    /** The routine the conversation belongs to. */
    readonly Routine: MJUserRoutineEntity;

    /** Timestamp when the event was raised. */
    readonly Timestamp: Date;

    constructor(conversationId: string, routine: MJUserRoutineEntity) {
        this.ConversationID = conversationId;
        this.Routine = routine;
        this.Timestamp = new Date();
    }
}

export class HistoryRecordOpenedEventArgs {
    /** Entity name of the linked record (e.g. 'MJ: AI Agent Runs'). */
    readonly EntityName: string;

    /** Primary key of the linked record. */
    readonly RecordID: string;

    /** The routine the run belongs to, when known. */
    readonly Routine: MJUserRoutineEntity | null;

    /** Timestamp when the event was raised. */
    readonly Timestamp: Date;

    constructor(entityName: string, recordId: string, routine: MJUserRoutineEntity | null = null) {
        this.EntityName = entityName;
        this.RecordID = recordId;
        this.Routine = routine;
        this.Timestamp = new Date();
    }
}
