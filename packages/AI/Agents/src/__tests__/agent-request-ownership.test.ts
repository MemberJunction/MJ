/**
 * MJAIAgentRequestEntityServer — an agent request is private to the user it is for.
 *
 * The UI role may create and update `MJ: AI Agent Requests` (metadata grant), so this guard
 * keeps the rows per-user: a non-Owner-type user may create a request only for themselves and
 * may update only a request that was already theirs (the PRE-save RequestForUserID). Owner-type
 * users, which include the scheduler's system user, are exempt, so cross-user paths such as
 * Send Inter-Agent Request keep working under an administrator or system context.
 */
import { describe, it, expect, vi } from 'vitest';
import { ValidationResult } from '@memberjunction/global';
import { ServerOperationScopeManager } from '@memberjunction/core';
import { TASK_GRAPH_RUNTIME_SECURITY_OPERATION } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { get Instance() { return { Config: vi.fn(async () => undefined), AgentTypes: [] }; } },
}));

interface FieldState {
    Dirty?: boolean;
    OldValue?: unknown;
}

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    class MockMJAIAgentRequestEntity {
        public RequestForUserID: string | null = null;
        public Status = 'Requested';
        public ResponseByUserID: string | null = null;
        public OriginatingTaskID: string | null = null;
        public OriginatingAgentRunID: string | null = null;
        public ResumingAgentRunID: string | null = null;
        public AgentID: string | null = null;
        public ID = 'QQQQQQQQ-0000-0000-0000-00000000000Q';
        public IsSaved = false;
        public ContextCurrentUser: { ID: string; Type: string | null } | null = null;
        private fieldState: Record<string, FieldState> = {};
        public SetFieldState(name: string, state: FieldState): void {
            this.fieldState[name] = state;
        }
        public GetFieldByName(name: string): FieldState {
            return this.fieldState[name] ?? { Dirty: false, OldValue: null };
        }
        public Validate(): ValidationResult {
            const r = new ValidationResult();
            r.Success = true;
            return r;
        }
        /** As `BaseEntity.Save`: validates, and writes only when that passes. */
        public async Save(): Promise<boolean> {
            return this.Validate().Success;
        }
    }
    return { ...actual, MJAIAgentRequestEntity: MockMJAIAgentRequestEntity };
});

import { MJAIAgentRequestEntityServer } from '../MJAIAgentRequestEntityServer';

interface MockHooks {
    IsSaved: boolean;
    ContextCurrentUser: { ID: string; Type: string | null } | null;
    SetFieldState(name: string, state: FieldState): void;
}

const ME = 'AAAAAAAA-0000-0000-0000-00000000000A';
const THEM = 'BBBBBBBB-0000-0000-0000-00000000000B';

function makeRequest(): MJAIAgentRequestEntityServer & MockHooks {
    return new MJAIAgentRequestEntityServer() as MJAIAgentRequestEntityServer & MockHooks;
}

describe('MJAIAgentRequestEntityServer.Validate — ownership', () => {
    it('lets a user create a request for themselves', () => {
        const r = makeRequest();
        r.RequestForUserID = ME.toLowerCase();
        r.ContextCurrentUser = { ID: ME, Type: 'User' };
        expect(r.Validate().Success).toBe(true);
    });

    it('blocks a non-Owner-type user from creating a request for someone else', () => {
        const r = makeRequest();
        r.RequestForUserID = THEM;
        r.ContextCurrentUser = { ID: ME, Type: 'User' };
        const result = r.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['RequestForUserID']);
    });

    it('blocks a non-Owner-type user from updating a request that is not theirs, judged by the PRE-save owner', () => {
        const r = makeRequest();
        r.IsSaved = true;
        r.RequestForUserID = ME;
        r.SetFieldState('RequestForUserID', { Dirty: true, OldValue: THEM });
        r.ContextCurrentUser = { ID: ME, Type: 'User' };
        expect(r.Validate().Success).toBe(false);
    });

    it('lets a user resolve their own request', () => {
        const r = makeRequest();
        r.IsSaved = true;
        r.RequestForUserID = ME;
        r.ContextCurrentUser = { ID: ME, Type: 'User' };
        expect(r.Validate().Success).toBe(true);
    });

    it('exempts Owner-type users (administrators and the scheduler system user)', () => {
        const r = makeRequest();
        r.RequestForUserID = THEM;
        r.ContextCurrentUser = { ID: ME, Type: 'Owner' };
        expect(r.Validate().Success).toBe(true);
    });

    it('skips the gate with no context user', () => {
        const r = makeRequest();
        r.RequestForUserID = THEM;
        r.ContextCurrentUser = null;
        expect(r.Validate().Success).toBe(true);
    });
});

describe('MJAIAgentRequestEntityServer — who answered', () => {
    /** A request for ME answered by this save: a workflow step's (updated) or an agent's (created already answered). */
    function answered(opts: { saved: boolean; user: { ID: string; Type: string | null } }): MJAIAgentRequestEntityServer & MockHooks {
        const r = makeRequest();
        r.IsSaved = opts.saved;
        r.RequestForUserID = ME;
        // Only the dispatcher creates a workflow request, so a create here is an agent's request.
        r.OriginatingTaskID = opts.saved ? 'task-1' : null;
        r.Status = 'Approved';
        if (opts.saved) r.SetFieldState('Status', { Dirty: true, OldValue: 'Requested' });
        r.ResponseByUserID = THEM;
        r.ContextCurrentUser = opts.user;
        return r;
    }

    const asClient = <T>(fn: () => T): T => ServerOperationScopeManager.Instance.RunInClientCrudBoundary(fn);

    it("records the user whose own request answers it as the responder, whatever the caller wrote", async () => {
        const r = answered({ saved: true, user: { ID: ME, Type: 'User' } });
        expect(await asClient(() => r.Save())).toBe(true);
        expect(r.ResponseByUserID).toBe(ME);
    });

    it("records the creator as the responder of a request their own request created already answered", async () => {
        const r = answered({ saved: false, user: { ID: ME, Type: 'User' } });
        expect(await asClient(() => r.Save())).toBe(true);
        expect(r.ResponseByUserID).toBe(ME);
    });

    it('records nobody when server code answers, even as the user the request is for', async () => {
        // An agent run calling Update Record, or Create Record with the request already Approved, as ME.
        const updated = answered({ saved: true, user: { ID: ME, Type: 'User' } });
        expect(await updated.Save()).toBe(true);
        expect(updated.ResponseByUserID).toBeNull();

        const created = answered({ saved: false, user: { ID: ME, Type: 'User' } });
        expect(await created.Save()).toBe(true);
        expect(created.ResponseByUserID).toBeNull();
        // Created for a workflow step, as the review's reproduction did, it is refused outright (below).

        // Server work started inside a client's request (a resumed agent run) is server code too.
        const fromServerWork = answered({ saved: true, user: { ID: ME, Type: 'User' } });
        expect(await asClient(() => ServerOperationScopeManager.Instance.RunAsServerWork(() => fromServerWork.Save()))).toBe(true);
        expect(fromServerWork.ResponseByUserID).toBeNull();
    });

    it("refuses changing an answered request's responder, an Owner-type user's change included", () => {
        const r = makeRequest();
        r.IsSaved = true;
        r.RequestForUserID = ME;
        r.Status = 'Approved';
        r.SetFieldState('Status', { Dirty: false, OldValue: 'Approved' });
        r.ResponseByUserID = ME;
        r.SetFieldState('ResponseByUserID', { Dirty: true, OldValue: THEM });
        r.ContextCurrentUser = { ID: THEM, Type: 'Owner' };
        const result = r.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['ResponseByUserID']);
    });
});

describe('MJAIAgentRequestEntityServer — workflow requests', () => {
    const asClient = <T>(fn: () => T): T => ServerOperationScopeManager.Instance.RunInClientCrudBoundary(fn);
    const asDispatcher = <T>(fn: () => T): T => ServerOperationScopeManager.Instance.RunWithAuthority(
        { operationKey: TASK_GRAPH_RUNTIME_SECURITY_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: AI Agent Requests'], userId: ME },
        fn,
    );
    const user = { ID: ME, Type: 'User' };

    /** A request for ME naming a workflow step; `stored` is its status before this save. */
    function workflowRequest(opts: { saved: boolean; stored?: string; next?: string }): MJAIAgentRequestEntityServer & MockHooks {
        const r = makeRequest();
        r.IsSaved = opts.saved;
        r.RequestForUserID = ME;
        r.OriginatingTaskID = 'task-1';
        r.Status = (opts.next ?? opts.stored ?? 'Requested') as typeof r.Status;
        if (opts.saved) r.SetFieldState('Status', { Dirty: r.Status !== (opts.stored ?? 'Requested'), OldValue: opts.stored ?? 'Requested' });
        r.ContextCurrentUser = user;
        return r;
    }
    const refusedFields = (r: MJAIAgentRequestEntityServer): string[] => r.Validate().Errors.map((e) => e.Source);

    it("refuses creating one outside the dispatcher's scope, already answered or not, by server code or a client", async () => {
        expect(await workflowRequest({ saved: false, next: 'Approved' }).Save()).toBe(false);
        expect(await workflowRequest({ saved: false }).Save()).toBe(false);
        expect(await asClient(() => workflowRequest({ saved: false, next: 'Approved' }).Save())).toBe(false);
        expect(await asDispatcher(() => workflowRequest({ saved: false }).Save())).toBe(true);
    });

    it("refuses pointing any saved request at a different step, an answered one included", () => {
        const repointed = makeRequest();
        repointed.IsSaved = true;
        repointed.RequestForUserID = ME;
        repointed.Status = 'Responded';
        repointed.ResponseByUserID = ME;
        repointed.OriginatingTaskID = 'task-1';
        repointed.SetFieldState('OriginatingTaskID', { Dirty: true, OldValue: null });
        repointed.ContextCurrentUser = user;
        expect(refusedFields(repointed)).toEqual(['OriginatingTaskID']);
        expect(asDispatcher(() => refusedFields(repointed))).toEqual(['OriginatingTaskID']);
    });

    it("refuses changing the dispatcher's question outside its scope", () => {
        const edited = workflowRequest({ saved: true });
        edited.SetFieldState('Request', { Dirty: true, OldValue: 'Approve the payment run?' });
        edited.SetFieldState('ResponseSchema', { Dirty: true, OldValue: null });
        expect(refusedFields(edited)).toEqual(['Request', 'ResponseSchema']);
        expect(asDispatcher(() => refusedFields(edited))).toEqual([]);
    });

    it('refuses changing an answer once given, and lets the open request be answered or withdrawn', () => {
        const changed = workflowRequest({ saved: true, stored: 'Approved', next: 'Approved' });
        changed.SetFieldState('ResponseData', { Dirty: true, OldValue: '{"ok":true}' });
        expect(refusedFields(changed)).toEqual(['ResponseData']);
        const reversed = workflowRequest({ saved: true, stored: 'Approved', next: 'Rejected' });
        expect(refusedFields(reversed)).toEqual(['Status']);

        expect(refusedFields(workflowRequest({ saved: true, stored: 'Requested', next: 'Approved' }))).toEqual([]);
        expect(refusedFields(workflowRequest({ saved: true, stored: 'Requested', next: 'Canceled' }))).toEqual([]);
    });

    it("lets only a person's own request hand a workflow step's request to someone else", () => {
        // Mine, handed to THEM.
        const reassigned = workflowRequest({ saved: true });
        reassigned.RequestForUserID = THEM;
        reassigned.SetFieldState('RequestForUserID', { Dirty: true, OldValue: ME });
        expect(refusedFields(reassigned)).toEqual(['RequestForUserID']);
        expect(asClient(() => refusedFields(reassigned))).toEqual([]);
    });

    it('takes an answer only from the save that gives it, so nothing can fill one in for the person to approve', () => {
        const prefilled = workflowRequest({ saved: true });
        prefilled.SetFieldState('ResponseData', { Dirty: true, OldValue: null });
        prefilled.SetFieldState('Response', { Dirty: true, OldValue: null });
        expect(refusedFields(prefilled)).toEqual(['Response', 'ResponseData']);
        expect(asClient(() => refusedFields(prefilled))).toEqual(['Response', 'ResponseData']);

        const answering = workflowRequest({ saved: true, stored: 'Requested', next: 'Approved' });
        answering.SetFieldState('ResponseData', { Dirty: true, OldValue: null });
        expect(refusedFields(answering)).toEqual([]);
    });
});
