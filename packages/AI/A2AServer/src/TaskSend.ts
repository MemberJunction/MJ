/**
 * The `tasks/send` operation: create a task or add a message to one of the caller's own tasks.
 *
 * Kept out of `Server.ts`, which connects to the database when imported, so the rules here are
 * tested by running them.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { TERMINAL_STATUSES, type IA2ATaskStore, type Message, type Part, type Task, type TaskStatus } from './TaskStore.js';

/**
 * The error message for a task the caller cannot see. Fixed text: the caller's task ID is never
 * echoed back, because the SSE route writes this message into a `text/event-stream` body
 * (a reflected-XSS sink), and because a missing task and another user's task must read the same.
 */
export const TASK_NOT_FOUND_MESSAGE = 'Task not found';

/**
 * The error message for a task the store could not save. Reported rather than ignored: a task that
 * exists only in this process's memory is invisible to every other replica and lost on restart.
 */
export const TASK_NOT_SAVED_MESSAGE = 'The task could not be saved';

/** What `tasks/send` returns: the task on success, or an HTTP error code and message. */
export type TaskSendOutcome =
    | {
        taskId: string; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape, serialized to every A2A client
        status: TaskStatus; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape, serialized to every A2A client
    }
    | { ErrorCode: 400 | 404 | 500; ErrorMessage: string };

/** What {@link HandleTaskSend} needs from the server. */
export interface TaskSendDependencies {
    /** The task store the caller's tasks live in. */
    Store: IA2ATaskStore;
    /** The provider the store reads and writes through. */
    Provider: IMetadataProvider;
    /** Starts processing a task in the background; not awaited. */
    StartProcessing: (task: Task) => void;
    /** A new task or message ID. */
    NewID: () => string;
}

/** The request body `tasks/send` reads. */
export interface TaskSendRequest {
    taskId?: string; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape
    message?: { parts?: Part[] }; // case-violation-ok-legacy-back-compat: the A2A protocol wire shape
}

/**
 * Creates a task (no `taskId`) or appends a user message to the caller's existing task, then starts
 * processing it. A task the caller does not own reads as missing.
 */
export async function HandleTaskSend(
    request: TaskSendRequest,
    caller: UserInfo | undefined,
    deps: TaskSendDependencies
): Promise<TaskSendOutcome> {
    return request.taskId
        ? continueTask(request.taskId, request.message, caller, deps)
        : createTask(request.message, caller, deps);
}

async function createTask(
    message: TaskSendRequest['message'],
    caller: UserInfo | undefined,
    deps: TaskSendDependencies
): Promise<TaskSendOutcome> {
    const taskID = deps.NewID();
    const now = new Date();
    const task: Task = { id: taskID, status: 'pending', messages: [], artifacts: [], created: now, updated: now };
    if (message) {
        task.messages.push(userMessage(taskID, message, deps));
    }
    deps.Store.Set(taskID, task, caller?.ID);
    if (!(await deps.Store.SaveTask(task, caller, deps.Provider))) {
        deps.Store.Delete(taskID);
        return { ErrorCode: 500, ErrorMessage: TASK_NOT_SAVED_MESSAGE };
    }
    deps.StartProcessing(task);
    return { taskId: taskID, status: task.status };
}

async function continueTask(
    taskID: string,
    message: TaskSendRequest['message'],
    caller: UserInfo | undefined,
    deps: TaskSendDependencies
): Promise<TaskSendOutcome> {
    // Only the caller's own task, so another user's task reads as missing
    const task = caller
        ? ((await deps.Store.LoadTaskForUser(taskID, caller, deps.Provider)) ?? deps.Store.GetForUser(taskID, caller.ID))
        : undefined;
    if (!task) {
        return { ErrorCode: 404, ErrorMessage: TASK_NOT_FOUND_MESSAGE };
    }
    if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'failed') {
        return { ErrorCode: 400, ErrorMessage: `Cannot update a task with status: ${task.status}` };
    }
    if (message) {
        task.messages.push(userMessage(task.id, message, deps));
        task.updated = new Date();
        if (!(await deps.Store.SaveTask(task, caller, deps.Provider))) {
            return { ErrorCode: 500, ErrorMessage: TASK_NOT_SAVED_MESSAGE };
        }
        // The save merged what other replicas wrote; a task finished elsewhere meanwhile is not restarted.
        if (TERMINAL_STATUSES.has(task.status)) {
            return { ErrorCode: 400, ErrorMessage: `Cannot update a task with status: ${task.status}` };
        }
        deps.StartProcessing(task);
    }
    return { taskId: task.id, status: task.status };
}

function userMessage(taskID: string, message: NonNullable<TaskSendRequest['message']>, deps: TaskSendDependencies): Message {
    return { id: deps.NewID(), taskId: taskID, role: 'user', parts: message.parts || [], created: new Date() };
}
