/**
 * @fileoverview {@link RoomHandoffEngine}: moves a LiveKit room conversation from the AI agent that is in it to a
 * person, a phone number, or another AI agent, while the caller stays in the room.
 *
 * The room is the shared plane. A handoff never transfers the caller; it adds the new party to the room the caller
 * is already in and then takes the AI out. That is what makes "warm" possible (the AI can say a sentence to the new
 * party with the caller listening) and what makes a failed handoff harmless (nobody is moved, so the AI just carries on).
 *
 * The flow for each destination:
 * - **person**: an offer is created and pushed to their console. If they accept, the console joins the room; the engine
 *   watches the room until they are actually present, then runs the leave step. If they decline, or do not answer in time
 *   (or accept but never appear), the engine dials the person's fallback number into the room when one is configured, and
 *   otherwise tells the model nobody is available.
 * - **number**: the room dials the number; when it answers and is present, the leave step runs.
 * - **agent**: the host starts the other agent in the room; when it is up, the leave step runs.
 *
 * The leave step is where warm and blind differ. Blind: the AI leaves as soon as the new party is present. Warm: the AI is
 * told the party has joined and to introduce them in a sentence or two, then to call `finish_handoff`; it leaves a moment
 * after that call (so its last words are heard), or after a ceiling if it never calls.
 *
 * Everything the engine touches the outside world with is an injected seam (presence, dialer, notifier, publisher, agent
 * starter), so the whole flow is unit-tested with fakes. One handoff runs per room at a time. State is in memory and per
 * process: see {@link HandoffOfferRegistry} for what a multi-instance deployment needs.
 *
 * @module @memberjunction/livekit-room-server
 */

import { LogError, LogStatus } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { LiveKitUserIdentity } from '../livekit-token-service';
import { HandoffOfferRegistry, ToOfferView, type HandoffOfferRecord, type ResolveOfferResult } from './handoff-offer-registry';
import type {
    HandoffOfferView,
    HandoffRequest,
    HandoffStartResult,
    IHandoffNotifier,
    IHandoffPublisher,
    IRoomDialer,
    IRoomHandoffObserver,
    IRoomPresence,
    RoomAgentStarter,
    RoomHandoffAgentContext,
} from './handoff-types';

/** The tool the AI calls after briefing the new party, to say it is done and can leave. */
export const FINISH_HANDOFF_TOOL = 'finish_handoff';

/** How long a person who accepted an offer has to actually appear in the room. */
export const HANDOFF_JOIN_WAIT_MS = 90_000;

/** How often the room is checked for the new party. */
export const HANDOFF_PRESENCE_POLL_MS = 1_000;

/** The longest the AI is given to brief the new party before it is removed anyway. */
export const HANDOFF_BRIEF_MAX_MS = 45_000;

/** How long the AI's last words are given to play after it calls {@link FINISH_HANDOFF_TOOL}. */
export const HANDOFF_LEAVE_SETTLE_MS = 3_000;

/** How long after a blind handoff's new party appears the AI leaves. */
export const HANDOFF_BLIND_LEAVE_DELAY_MS = 1_500;

/** How long a number the room dials is allowed to ring. */
export const HANDOFF_DIAL_RING_SECONDS = 30;

/** The longest summary kept (it is shown on the offer and given to a taking-over agent). */
export const MAX_HANDOFF_SUMMARY_CHARS = 600;

/** The collaborators the engine uses. All optional: a handoff kind whose collaborator is missing is refused clearly. */
export interface RoomHandoffDeps {
    Presence?: IRoomPresence;
    Dialer?: IRoomDialer;
    Notifier?: IHandoffNotifier;
    Publisher?: IHandoffPublisher;
    AgentStarter?: RoomAgentStarter;
    Observer?: IRoomHandoffObserver;
}

/** Where a handoff is in its life. */
type HandoffPhase = 'offering' | 'dialing' | 'joining' | 'agent-joining' | 'awaiting-leave' | 'leaving';

/** One handoff in progress for a room. */
interface HandoffFlow {
    FlowID: number;
    Agent: RoomHandoffAgentContext;
    Request: HandoffRequest;
    Phase: HandoffPhase;
    OfferID?: string;
    Cancelled: boolean;
    Timers: Set<ReturnType<typeof setTimeout>>;
}

/** Brings a person, a number or another agent into a room conversation and takes the AI out. */
export class RoomHandoffEngine extends BaseSingleton<RoomHandoffEngine> {
    private deps: RoomHandoffDeps = {};
    private readonly flows = new Map<string, HandoffFlow>();
    private nextFlowID = 1;

    protected constructor() {
        super();
    }

    /** The process-wide engine. */
    public static get Instance(): RoomHandoffEngine {
        return super.getInstance<RoomHandoffEngine>();
    }

    /** Sets (merges) the collaborators. Called once at startup by the host that owns each one. */
    public Configure(deps: RoomHandoffDeps): void {
        this.deps = { ...this.deps, ...deps };
    }

    /** The collaborators currently set (a `Pick` for diagnostics; tests read it). */
    public get Deps(): Readonly<RoomHandoffDeps> {
        return this.deps;
    }

    /** Drops every flow and every collaborator (tests, shutdown). */
    public Reset(): void {
        for (const flow of this.flows.values()) {
            this.cancelFlow(flow, 'Cancelled');
        }
        this.flows.clear();
        this.deps = {};
    }

    /**
     * Starts handing the conversation over. Returns at once; what happens next is reported to the model through
     * {@link RoomHandoffAgentContext.NotifyModel}.
     */
    public RequestHandoff(agent: RoomHandoffAgentContext, request: HandoffRequest): HandoffStartResult {
        const key = roomKey(agent.RoomName);
        if (this.flows.has(key)) {
            return { Ok: false, Error: 'A handoff is already in progress for this call.' };
        }
        const prepared = this.prepare(request);
        if (!prepared.Ok) {
            return prepared;
        }
        const flow: HandoffFlow = { FlowID: this.nextFlowID++, Agent: agent, Request: prepared.Request, Phase: 'offering', Cancelled: false, Timers: new Set() };
        const started = this.begin(flow);
        if (started.Ok) {
            this.flows.set(key, flow);
        }
        return started;
    }

    /** The AI says it has finished briefing and is ready to leave. Returns whether a handoff was waiting for that. */
    public AgentReadyToLeave(roomName: string): boolean {
        const flow = this.flows.get(roomKey(roomName));
        if (!flow || flow.Phase !== 'awaiting-leave') {
            return false;
        }
        flow.Phase = 'leaving';
        this.armTimer(flow, HANDOFF_LEAVE_SETTLE_MS, () => this.leave(flow));
        return true;
    }

    /** Whether a handoff is in progress for the room. */
    public HasHandoff(roomName: string): boolean {
        return this.flows.has(roomKey(roomName));
    }

    /**
     * The room's call ended or the agent left for another reason: abandon its handoff and withdraw its offer. A flow
     * that is already leaving is finished, not cancelled.
     */
    public CancelRoom(roomName: string): void {
        const key = roomKey(roomName);
        const flow = this.flows.get(key);
        if (!flow || flow.Phase === 'leaving') {
            return;
        }
        this.flows.delete(key);
        this.cancelFlow(flow, 'Cancelled');
    }

    /** The offers to show a person (pending ones and recently resolved ones). */
    public ListOffersForUser(userID: string): HandoffOfferView[] {
        return HandoffOfferRegistry.Instance.ListForUser(userID).map(ToOfferView);
    }

    /**
     * A person accepts an offer. Authorised by the offer's target; anything else answers as a missing offer. On success
     * the console should join the room; the engine watches for them and takes the AI out once they are there.
     */
    public AcceptOffer(offerID: string, userID: string): { Ok: true; Offer: HandoffOfferView } | { Ok: false; Reason: string } {
        const resolved = HandoffOfferRegistry.Instance.ResolveForUser(offerID, userID, 'Accepted');
        if (!resolved.Ok) {
            return resolved;
        }
        const flow = this.flowForOffer(resolved.Offer);
        if (!flow) {
            // The call ended between the offer and the accept without cancelling it (should not happen, but never accept into nothing).
            HandoffOfferRegistry.Instance.Close(offerID, 'Cancelled');
            return { Ok: false, Reason: 'This conversation is no longer in progress.' };
        }
        this.publishUpdate(resolved.Offer);
        this.deps.Observer?.OnHandoffEvent?.({
            RoomName: resolved.Offer.RoomName,
            EventType: 'Accepted',
            ActorUserID: userID,
            Details: { OfferID: offerID },
            ContextUser: flow.Agent.ContextUser,
            Provider: flow.Agent.Provider,
        });
        this.clearTimers(flow);
        flow.Phase = 'joining';
        void this.waitForUserToJoin(flow, userID);
        return { Ok: true, Offer: ToOfferView(resolved.Offer) };
    }

    /** A person declines an offer. Authorised the same way as {@link AcceptOffer}. */
    public DeclineOffer(offerID: string, userID: string): { Ok: true } | { Ok: false; Reason: string } {
        const resolved: ResolveOfferResult = HandoffOfferRegistry.Instance.ResolveForUser(offerID, userID, 'Declined');
        if (!resolved.Ok) {
            return resolved;
        }
        this.publishUpdate(resolved.Offer);
        const flow = this.flowForOffer(resolved.Offer);
        if (flow) {
            this.deps.Observer?.OnHandoffEvent?.({
                RoomName: resolved.Offer.RoomName,
                EventType: 'Declined',
                ActorUserID: userID,
                Details: { OfferID: offerID },
                ContextUser: flow.Agent.ContextUser,
                Provider: flow.Agent.Provider,
            });
            this.clearTimers(flow);
            this.onPartyUnavailable(flow, 'declined the conversation');
        }
        return { Ok: true };
    }

    // ── starting ─────────────────────────────────────────────────────────────────

    /** Checks the request and that the collaborators its kind needs are present. */
    private prepare(request: HandoffRequest): ({ Ok: true; Request: HandoffRequest }) | { Ok: false; Error: string } {
        const summary = (request.Summary ?? '').trim().slice(0, MAX_HANDOFF_SUMMARY_CHARS);
        if (!summary) {
            return { Ok: false, Error: 'A short summary of the conversation is required.' };
        }
        const destination = request.Destination;
        if (destination.Kind === 'agent' && !this.deps.AgentStarter) {
            return { Ok: false, Error: 'Handing over to another agent is not available on this server.' };
        }
        if (destination.Kind === 'number' && (!this.deps.Dialer || !this.deps.Presence)) {
            return { Ok: false, Error: 'Dialing a number into the call is not available on this server.' };
        }
        if (destination.Kind === 'user' && !this.deps.Presence) {
            return { Ok: false, Error: 'Bringing a person into the call is not available on this server.' };
        }
        return { Ok: true, Request: { ...request, Summary: summary } };
    }

    private begin(flow: HandoffFlow): HandoffStartResult {
        const destination = flow.Request.Destination;
        switch (destination.Kind) {
            case 'user':
                return this.offerToUser(flow);
            case 'number':
                flow.Phase = 'dialing';
                void this.dialAndAwait(flow, destination.Number, destination.DisplayName, 'the number');
                return { Ok: true, Status: 'dialing' };
            case 'agent':
                flow.Phase = 'agent-joining';
                void this.startAgent(flow);
                return { Ok: true, Status: 'agent-joining' };
        }
    }

    private offerToUser(flow: HandoffFlow): HandoffStartResult {
        const destination = flow.Request.Destination;
        if (destination.Kind !== 'user') {
            return { Ok: false, Error: 'Not a person.' };
        }
        const offer = HandoffOfferRegistry.Instance.Create({
            RoomName: flow.Agent.RoomName,
            TargetUserID: destination.UserID,
            Mode: flow.Request.Mode,
            Summary: flow.Request.Summary,
            CallerLabel: flow.Agent.CallerLabel,
            AgentName: flow.Agent.AgentName,
        });
        if (!offer) {
            return { Ok: false, Error: `${destination.DisplayName} has too many open conversation offers right now.` };
        }
        flow.OfferID = offer.OfferID;
        this.publish({ UserID: offer.TargetUserID, Kind: 'offered', Offer: ToOfferView(offer) });
        void this.notify(offer, flow);
        this.deps.Observer?.OnHandoffEvent?.({
            RoomName: flow.Agent.RoomName,
            EventType: 'Offered',
            ActorUserID: destination.UserID,
            Details: { OfferID: offer.OfferID, Summary: flow.Request.Summary, Mode: flow.Request.Mode },
            ContextUser: flow.Agent.ContextUser,
            Provider: flow.Agent.Provider,
        });
        this.deps.Observer?.OnHandoffEvent?.({
            RoomName: flow.Agent.RoomName,
            EventType: 'Escalated',
            ActorUserID: destination.UserID,
            Details: { OfferID: offer.OfferID, Summary: flow.Request.Summary },
            ContextUser: flow.Agent.ContextUser,
            Provider: flow.Agent.Provider,
        });
        this.armTimer(flow, offer.ExpiresAtMs - offer.CreatedAtMs, () => this.onOfferTimeout(flow));
        return { Ok: true, Status: 'offered' };
    }

    // ── person: waiting for the answer ───────────────────────────────────────────

    private onOfferTimeout(flow: HandoffFlow): void {
        if (flow.Cancelled || !flow.OfferID) {
            return;
        }
        const closed = HandoffOfferRegistry.Instance.Close(flow.OfferID, 'Expired');
        if (!closed) {
            return; // accepted or declined in the same instant
        }
        this.publishUpdate(closed);
        this.onPartyUnavailable(flow, 'did not answer in time');
    }

    private async waitForUserToJoin(flow: HandoffFlow, userID: string): Promise<void> {
        const joined = await this.pollPresence(flow, LiveKitUserIdentity(userID), HANDOFF_JOIN_WAIT_MS);
        if (flow.Cancelled) {
            return;
        }
        if (joined) {
            this.onPartyPresent(flow);
        } else {
            this.onPartyUnavailable(flow, 'accepted but did not join the call');
        }
    }

    // ── number and fallback: dialing ─────────────────────────────────────────────

    /** Dials a number into the room and waits for it to appear. Used for a number target and for a person's fallback. */
    private async dialAndAwait(flow: HandoffFlow, number: string, displayName: string, what: string): Promise<void> {
        const identity = `sip-handoff-${flow.FlowID}`;
        flow.Phase = 'dialing';
        try {
            await this.deps.Dialer?.DialIntoRoom({
                RoomName: flow.Agent.RoomName,
                Number: number,
                ParticipantIdentity: identity,
                DisplayName: displayName,
                RingTimeoutSeconds: HANDOFF_DIAL_RING_SECONDS,
            });
        } catch (e) {
            LogError(`[RoomHandoff] dialing ${what} into room ${flow.Agent.RoomName} failed: ${e instanceof Error ? e.message : String(e)}`);
            this.finishUnavailable(flow, `${displayName} could not be reached by phone`);
            return;
        }
        const answered = await this.pollPresence(flow, identity, HANDOFF_JOIN_WAIT_MS);
        if (flow.Cancelled) {
            return;
        }
        if (answered) {
            this.onPartyPresent(flow);
        } else {
            this.finishUnavailable(flow, `${displayName} did not pick up`);
        }
    }

    // ── agent: starting another agent ────────────────────────────────────────────

    private async startAgent(flow: HandoffFlow): Promise<void> {
        const destination = flow.Request.Destination;
        if (destination.Kind !== 'agent' || !this.deps.AgentStarter) {
            return;
        }
        try {
            await this.deps.AgentStarter({
                RoomName: flow.Agent.RoomName,
                AgentID: destination.AgentID,
                AgentName: destination.AgentName,
                Brief: flow.Request.Summary,
                PreviousAgentName: flow.Agent.AgentName,
                CallerLabel: flow.Agent.CallerLabel,
                ContextUser: flow.Agent.ContextUser,
                Provider: flow.Agent.Provider,
            });
        } catch (e) {
            LogError(`[RoomHandoff] starting agent ${destination.AgentName} in room ${flow.Agent.RoomName} failed: ${e instanceof Error ? e.message : String(e)}`);
            this.finishUnavailable(flow, `${destination.AgentName} could not be started`);
            return;
        }
        if (!flow.Cancelled) {
            this.onPartyPresent(flow);
        }
    }

    // ── the new party is (not) there ─────────────────────────────────────────────

    /** The person did not take it. Fall back to their phone when one is configured, otherwise tell the model. */
    private onPartyUnavailable(flow: HandoffFlow, why: string): void {
        const destination = flow.Request.Destination;
        if (destination.Kind === 'user' && destination.FallbackNumber && this.deps.Dialer && this.deps.Presence) {
            flow.Agent.NotifyModel(
                `[handoff] ${destination.DisplayName} ${why}. You are now trying their phone. Keep the caller company, and say you are still working on connecting them.`,
            );
            void this.dialAndAwait(flow, destination.FallbackNumber, destination.DisplayName, 'the fallback number');
            return;
        }
        this.finishUnavailable(flow, `${displayNameOf(flow)} ${why}`);
    }

    /** The handoff failed for good: tell the model so it can tell the caller, and let the call carry on with the AI. */
    private finishUnavailable(flow: HandoffFlow, why: string): void {
        if (flow.Cancelled) {
            return;
        }
        this.removeFlow(flow);
        flow.Agent.NotifyModel(
            `[handoff] Nobody could take the conversation: ${why}. Tell the caller honestly that nobody is available right now, ` +
                'and offer to keep helping, or to take a message. Do not say you are transferring them.',
        );
        LogStatus(`[RoomHandoff] handoff in room ${flow.Agent.RoomName} did not complete: ${why}.`);
    }

    /** The new party is in the room. Blind: the AI leaves. Warm: the AI briefs them, then leaves. */
    private onPartyPresent(flow: HandoffFlow): void {
        if (flow.Cancelled) {
            return;
        }
        const name = displayNameOf(flow);
        this.deps.Observer?.OnHandoffEvent?.({
            RoomName: flow.Agent.RoomName,
            EventType: 'Transferred',
            Details: {
                Target: name,
                Kind: flow.Request.Destination.Kind,
                Mode: flow.Request.Mode,
            },
            ContextUser: flow.Agent.ContextUser,
            Provider: flow.Agent.Provider,
        });
        if (flow.Request.Mode === 'blind') {
            flow.Phase = 'leaving';
            this.armTimer(flow, HANDOFF_BLIND_LEAVE_DELAY_MS, () => this.leave(flow));
            return;
        }
        flow.Phase = 'awaiting-leave';
        flow.Agent.NotifyModel(
            `[handoff] ${name} has joined the call. In one or two short sentences, introduce ${name} to the caller and tell ${name} the key points: ` +
                `${flow.Request.Summary} Then call ${FINISH_HANDOFF_TOOL}. Do not carry on the conversation yourself after that.`,
        );
        this.armTimer(flow, HANDOFF_BRIEF_MAX_MS, () => this.leave(flow));
    }

    /** Takes the AI out of the room. The flow is removed first, so the agent's own teardown does not read as a cancellation. */
    private async leave(flow: HandoffFlow): Promise<void> {
        if (flow.Cancelled) {
            return;
        }
        this.removeFlow(flow);
        try {
            await flow.Agent.LeaveRoom();
            LogStatus(`[RoomHandoff] ${flow.Agent.AgentName} left room ${flow.Agent.RoomName} after the handoff.`);
        } catch (e) {
            LogError(`[RoomHandoff] ${flow.Agent.AgentName} could not leave room ${flow.Agent.RoomName}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    // ── plumbing ─────────────────────────────────────────────────────────────────

    /** Checks the room for a participant until it is there, the flow is cancelled, or the time is up. */
    private async pollPresence(flow: HandoffFlow, identity: string, maxMs: number): Promise<boolean> {
        const polls = Math.max(1, Math.ceil(maxMs / HANDOFF_PRESENCE_POLL_MS));
        for (let i = 0; i < polls; i++) {
            if (flow.Cancelled) {
                return false;
            }
            if (await this.isPresent(flow.Agent.RoomName, identity)) {
                return true;
            }
            await sleep(HANDOFF_PRESENCE_POLL_MS);
        }
        return false;
    }

    private async isPresent(roomName: string, identity: string): Promise<boolean> {
        try {
            return (await this.deps.Presence?.IsParticipantPresent(roomName, identity)) === true;
        } catch (e) {
            LogError(`[RoomHandoff] checking room ${roomName} for ${identity} failed: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    private async notify(offer: HandoffOfferRecord, flow: HandoffFlow): Promise<void> {
        try {
            await this.deps.Notifier?.NotifyOffer(ToOfferView(offer), offer.TargetUserID, flow.Agent.ContextUser, flow.Agent.Provider);
        } catch (e) {
            LogError(`[RoomHandoff] notifying about offer ${offer.OfferID} failed (the live console still receives it): ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private publishUpdate(offer: HandoffOfferRecord): void {
        this.publish({ UserID: offer.TargetUserID, Kind: 'updated', Offer: ToOfferView(offer) });
    }

    private publish(event: Parameters<IHandoffPublisher['Publish']>[0]): void {
        try {
            this.deps.Publisher?.Publish(event);
        } catch (e) {
            LogError(`[RoomHandoff] publishing an offer change failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private flowForOffer(offer: HandoffOfferRecord): HandoffFlow | undefined {
        const flow = this.flows.get(roomKey(offer.RoomName));
        return flow && flow.OfferID === offer.OfferID ? flow : undefined;
    }

    private removeFlow(flow: HandoffFlow): void {
        this.clearTimers(flow);
        const key = roomKey(flow.Agent.RoomName);
        if (this.flows.get(key) === flow) {
            this.flows.delete(key);
        }
    }

    /** Stops a flow's timers and withdraws its offer. */
    private cancelFlow(flow: HandoffFlow, status: 'Cancelled'): void {
        flow.Cancelled = true;
        this.clearTimers(flow);
        if (flow.OfferID) {
            const closed = HandoffOfferRegistry.Instance.Close(flow.OfferID, status);
            if (closed) {
                this.publishUpdate(closed);
            }
        }
    }

    private armTimer(flow: HandoffFlow, ms: number, work: () => void | Promise<void>): void {
        const timer = setTimeout(() => {
            flow.Timers.delete(timer);
            void Promise.resolve(work()).catch((e) => LogError(`[RoomHandoff] a handoff timer failed: ${e instanceof Error ? e.message : String(e)}`));
        }, ms);
        (timer as { unref?: () => void }).unref?.();
        flow.Timers.add(timer);
    }

    private clearTimers(flow: HandoffFlow): void {
        for (const timer of flow.Timers) {
            clearTimeout(timer);
        }
        flow.Timers.clear();
    }
}

function roomKey(roomName: string): string {
    return roomName.trim().toLowerCase();
}

/** What the AI and the logs call the party being brought in. */
function displayNameOf(flow: HandoffFlow): string {
    const destination = flow.Request.Destination;
    return destination.Kind === 'agent' ? destination.AgentName : destination.DisplayName;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        (timer as { unref?: () => void }).unref?.();
    });
}
