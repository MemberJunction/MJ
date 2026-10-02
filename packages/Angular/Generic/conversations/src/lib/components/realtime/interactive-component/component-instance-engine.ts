/**
 * @fileoverview The Interactive Component channel's state of record: which components are open, which one the
 * user is looking at, what version each shows, and the last thing each reported.
 *
 * Framework-free and synchronous. The channel mutates it; the Angular surface observes {@link ComponentInstanceEngine.Changed$}
 * and renders it. Keeping it separate means the rules (the instance cap, "swapping a version keeps the instance")
 * are tested without a browser and are the same whoever drives them.
 *
 * @module @memberjunction/ng-conversations
 */

import { Observable, Subject } from 'rxjs';
import type { JSONObject, JSONValue } from '@memberjunction/ai';
import { DeriveComponentContract, type ComponentContract } from './component-contract';
import type { IInteractiveComponentHandle, ResolvedComponentArtifact } from './interactive-component-types';

/** The last thing a component reported, kept so it can ride in the state the model perceives. */
export interface ComponentLastEvent {
    /** The event type or state path. */
    Type: string;
    /** The (bounded) payload. */
    Payload: JSONValue;
    /** Monotonic per engine, so two identical events in a row still register as a change. */
    Seq: number;
}

/** One open component. */
export interface ComponentInstanceRecord {
    /** The instance id the agent addresses (`c1`, `c2`, ...). Stable for the life of the instance, across version swaps. */
    readonly InstanceID: string;
    /** The artifact version currently shown. */
    Artifact: ResolvedComponentArtifact;
    /** What the agent can do with it, derived from {@link Artifact}'s spec; re-derived on a version swap. */
    Contract: ComponentContract;
    /** The inputs it was opened with. */
    Inputs: JSONObject;
    /** The last event it reported, if any. */
    LastEvent: ComponentLastEvent | null;
    /** The live handle on the rendered component, once the surface has mounted it. */
    Handle: IInteractiveComponentHandle | null;
}

/** What changed, for the surface to react to. */
export type ComponentInstanceChange =
    | { Kind: 'added'; InstanceID: string }
    | { Kind: 'removed'; InstanceID: string }
    | { Kind: 'version'; InstanceID: string }
    | { Kind: 'active'; InstanceID: string | null }
    | { Kind: 'event'; InstanceID: string };

/** Why an instance could not be added. */
export class InstanceLimitError extends Error {
    /** @param Limit The configured cap. */
    public constructor(public readonly Limit: number) {
        super(`At most ${Limit} component${Limit === 1 ? ' is' : 's are'} open at once. Close one first.`);
        this.name = 'InstanceLimitError';
    }
}

/** The set of open components. */
export class ComponentInstanceEngine {
    private readonly records = new Map<string, ComponentInstanceRecord>();
    private readonly changedSubject = new Subject<ComponentInstanceChange>();
    private activeId: string | null = null;
    private instanceSeq = 0;
    private eventSeq = 0;

    /** @param maxInstances The most components that may be open at once. */
    public constructor(private maxInstances: number) {}

    /** Every change, as it happens. Completes at {@link Dispose}. */
    public readonly Changed$: Observable<ComponentInstanceChange> = this.changedSubject.asObservable();

    /** Updates the instance cap (the configuration is read after the engine is created). Open instances above a lowered cap stay open. */
    public SetMaxInstances(maxInstances: number): void {
        this.maxInstances = maxInstances;
    }

    /** The open components, in the order they were opened. */
    public get Instances(): readonly ComponentInstanceRecord[] {
        return [...this.records.values()];
    }

    /** The id of the instance the user is looking at, or `null` when nothing is open. */
    public get ActiveID(): string | null {
        return this.activeId;
    }

    /** The instance with this id, or `undefined`. */
    public Get(instanceId: string): ComponentInstanceRecord | undefined {
        return this.records.get(instanceId);
    }

    /** The instance showing a version of this artifact, or `undefined`. */
    public FindByArtifact(artifactId: string): ComponentInstanceRecord | undefined {
        return this.Instances.find((r) => r.Artifact.ArtifactID.toLowerCase() === artifactId.toLowerCase());
    }

    /**
     * Opens a component and makes it the active one.
     *
     * @param artifact The loaded artifact version.
     * @param inputs What the agent passed to seed it with.
     * @throws {InstanceLimitError} When the cap is reached.
     */
    public Add(artifact: ResolvedComponentArtifact, inputs: JSONObject): ComponentInstanceRecord {
        if (this.records.size >= this.maxInstances) {
            throw new InstanceLimitError(this.maxInstances);
        }
        const record: ComponentInstanceRecord = {
            InstanceID: `c${++this.instanceSeq}`,
            Artifact: artifact,
            Contract: DeriveComponentContract(artifact.Spec),
            Inputs: inputs,
            LastEvent: null,
            Handle: null,
        };
        this.records.set(record.InstanceID, record);
        this.changedSubject.next({ Kind: 'added', InstanceID: record.InstanceID });
        this.SetActive(record.InstanceID);
        return record;
    }

    /** Closes an instance; the previous one in open order becomes active. Returns `false` when there is no such instance. */
    public Remove(instanceId: string): boolean {
        if (!this.records.delete(instanceId)) {
            return false;
        }
        this.changedSubject.next({ Kind: 'removed', InstanceID: instanceId });
        if (this.activeId === instanceId) {
            const remaining = this.Instances;
            this.activeId = null;
            this.SetActive(remaining.length > 0 ? remaining[remaining.length - 1].InstanceID : null);
        }
        return true;
    }

    /**
     * Shows another version in an existing instance. The instance id, its inputs and its place in the open order are
     * kept; only the artifact version (and what is derived from its spec) changes, and the old handle is dropped
     * (the surface re-attaches one once the new version has initialized).
     */
    public SwapVersion(instanceId: string, artifact: ResolvedComponentArtifact): boolean {
        const record = this.records.get(instanceId);
        if (!record) {
            return false;
        }
        record.Artifact = artifact;
        record.Contract = DeriveComponentContract(artifact.Spec);
        record.LastEvent = null;
        record.Handle = null;
        this.changedSubject.next({ Kind: 'version', InstanceID: instanceId });
        return true;
    }

    /** Makes an instance the active one (or `null` for none). Returns `false` for an unknown id. */
    public SetActive(instanceId: string | null): boolean {
        if (instanceId !== null && !this.records.has(instanceId)) {
            return false;
        }
        if (this.activeId !== instanceId) {
            this.activeId = instanceId;
            this.changedSubject.next({ Kind: 'active', InstanceID: instanceId });
        }
        return true;
    }

    /** Attaches (or detaches, with `null`) the live handle on a rendered component. */
    public AttachHandle(instanceId: string, handle: IInteractiveComponentHandle | null): void {
        const record = this.records.get(instanceId);
        if (record) {
            record.Handle = handle;
        }
    }

    /** Records what a component just reported. Returns `false` for an unknown instance. */
    public RecordEvent(instanceId: string, type: string, payload: JSONValue): boolean {
        const record = this.records.get(instanceId);
        if (!record) {
            return false;
        }
        record.LastEvent = { Type: type, Payload: payload, Seq: ++this.eventSeq };
        this.changedSubject.next({ Kind: 'event', InstanceID: instanceId });
        return true;
    }

    /** Closes every instance without emitting per-instance changes, and completes {@link Changed$}. */
    public Dispose(): void {
        this.records.clear();
        this.activeId = null;
        this.changedSubject.complete();
    }
}
