import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import type { JSONObject } from '@memberjunction/ai';
import type { IMetadataProvider } from '@memberjunction/core';
import type { RealtimeChannelContext } from '@memberjunction/realtime-runtime';
import {
    ComponentArtifactError,
    type IComponentArtifactSource,
    type IInteractiveComponentHandle,
    type ResolvedComponentArtifact,
} from '../../lib/components/realtime/interactive-component/interactive-component-types';

/** A complete, renderable spec; override what a test cares about. */
export function MakeSpec(overrides: Partial<ComponentSpec> = {}): ComponentSpec {
    return {
        name: 'RevenueDashboard',
        location: 'embedded',
        title: 'Revenue dashboard',
        description: 'Revenue by region.',
        type: 'dashboard',
        code: 'function RevenueDashboard() { return null; }',
        functionalRequirements: 'Show revenue.',
        technicalDesign: 'A single React component.',
        exampleUsage: '<RevenueDashboard />',
        ...overrides,
    };
}

/** A resolved artifact for a spec. */
export function MakeArtifact(
    artifactId: string,
    versionId: string,
    versionNumber: number,
    spec: ComponentSpec = MakeSpec(),
    name: string = spec.title
): ResolvedComponentArtifact {
    return { ArtifactID: artifactId, VersionID: versionId, VersionNumber: versionNumber, Name: name, Spec: spec };
}

/** An in-memory artifact source. Versions are keyed by version id; `LoadLatest` returns the highest version number of the artifact. */
export class FakeArtifactSource implements IComponentArtifactSource {
    public readonly Versions = new Map<string, ResolvedComponentArtifact>();
    public readonly Calls: string[] = [];

    public Add(artifact: ResolvedComponentArtifact): this {
        this.Versions.set(artifact.VersionID.toLowerCase(), artifact);
        return this;
    }

    public async LoadVersion(versionId: string): Promise<ResolvedComponentArtifact> {
        this.Calls.push(`version:${versionId}`);
        const found = this.Versions.get(versionId.toLowerCase());
        if (!found) {
            throw new ComponentArtifactError('not_found', 'No artifact version with that id exists, or you cannot see it.');
        }
        return found;
    }

    public async LoadLatest(artifactId: string): Promise<ResolvedComponentArtifact> {
        this.Calls.push(`latest:${artifactId}`);
        const versions = [...this.Versions.values()].filter((v) => v.ArtifactID.toLowerCase() === artifactId.toLowerCase());
        if (versions.length === 0) {
            throw new ComponentArtifactError('not_found', 'No artifact with that id exists, or you cannot see it.');
        }
        return versions.sort((a, b) => b.VersionNumber - a.VersionNumber)[0];
    }
}

/** A scriptable component handle that records every call. */
export class FakeHandle implements IInteractiveComponentHandle {
    public IsReady = true;
    public readonly Calls: string[] = [];
    public Methods = new Set<string>();
    public MethodResult: unknown = undefined;
    public DataState: object | undefined = undefined;
    public Dirty = false;
    public ValidateResult: unknown = true;
    public ThrowOnInvoke: Error | null = null;

    public HasMethod(methodName: string): boolean {
        return this.Methods.has(methodName);
    }
    public async InvokeMethod(methodName: string, args: readonly unknown[]): Promise<unknown> {
        this.Calls.push(`invoke:${methodName}(${JSON.stringify(args)})`);
        if (this.ThrowOnInvoke) {
            throw this.ThrowOnInvoke;
        }
        return this.MethodResult;
    }
    public GetCurrentDataState(): object | undefined {
        return this.DataState;
    }
    public Refresh(): void {
        this.Calls.push('refresh');
    }
    public Print(): void {
        this.Calls.push('print');
    }
    public Validate(): unknown {
        this.Calls.push('validate');
        return this.ValidateResult;
    }
    public IsDirty(): boolean {
        return this.Dirty;
    }
    public Reset(): void {
        this.Calls.push('reset');
    }
    public ScrollTo(target: string | { top?: number; left?: number }): void {
        this.Calls.push(`scrollTo:${JSON.stringify(target)}`);
    }
    public Focus(target?: string): void {
        this.Calls.push(`focus:${target ?? ''}`);
    }
}

/** What a channel under test sent to the model and saved. */
export interface ChannelLog {
    Notes: string[];
}

/** A minimal channel context that records the notes sent to the model. */
export function MakeContext(log: ChannelLog, config: JSONObject = {}): RealtimeChannelContext {
    return {
        AgentName: 'Sage',
        Provider: null as IMetadataProvider | null,
        SendContextNote: (text: string) => log.Notes.push(text),
        RequestSave: () => undefined,
        SetFocusMode: () => undefined,
        SaveAsArtifact: async () => null,
        AgentSessionID: null,
        ExecuteServerAction: async () => null,
        ChannelConfig: config,
    };
}
