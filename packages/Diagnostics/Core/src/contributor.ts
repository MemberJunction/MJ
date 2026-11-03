/**
 * Extensible Diagnostic Contributor contract & process-wide singleton registry.
 * Any MemberJunction engine or OpenApp can implement {@link BaseDiagnosticContributor}
 * and register with {@link DiagnosticContributorRegistry.Instance} to contribute custom
 * state snapshots into `contrib/<SectionKey>.json` inside a `.mjdiag` bundle.
 */

import { BaseSingleton } from '@memberjunction/global';
import { IsValidContributorSectionKey, type DiagnosticFidelity, type DiagnosticMode, type DiagnosticScrubberProfile } from './types.js';
import { ScrubValue } from './scrubber.js';

export interface DiagnosticContributionContext {
    sessionId: string;
    userId?: string;
    scrubberProfile: DiagnosticScrubberProfile;
    mode?: DiagnosticMode;
    fidelity?: DiagnosticFidelity;
    traceIds?: ReadonlyArray<string>;
}

export type DiagnosticContributorContext = DiagnosticContributionContext;

export abstract class BaseDiagnosticContributor {
    /**
     * Identifier used for the archive file name `contrib/<SectionKey>.json`:
     * 1-64 characters from `A-Z a-z 0-9 . _ -`, with no `..` and not ending in `.`.
     */
    public abstract get SectionKey(): string;

    /**
     * Collects diagnostic state for the given session context.
     * Implementations should be read-only and complete within 2000ms.
     */
    public abstract Collect(
        context: DiagnosticContributionContext
    ): Promise<Record<string, unknown>> | Record<string, unknown>;
}

export class DiagnosticContributorRegistry extends BaseSingleton<DiagnosticContributorRegistry> {
    private readonly _contributors = new Map<string, BaseDiagnosticContributor>();

    public constructor() {
        super();
    }

    public static get Instance(): DiagnosticContributorRegistry {
        return DiagnosticContributorRegistry.getInstance<DiagnosticContributorRegistry>();
    }

    /**
     * Registers a contributor and returns a function that unregisters it.
     * Throws when the `SectionKey` is not valid (see {@link IsValidContributorSectionKey})
     * or another contributor already holds it.
     */
    public RegisterContributor(contributor: BaseDiagnosticContributor): () => void {
        const key = contributor.SectionKey;
        if (!IsValidContributorSectionKey(key)) {
            throw new Error(
                `Invalid diagnostic contributor SectionKey ${JSON.stringify(key)}: use 1-64 characters from A-Z a-z 0-9 . _ - with no "..", not ending in "."`
            );
        }
        const existing = this._contributors.get(key);
        if (existing && existing !== contributor) {
            throw new Error(`A diagnostic contributor with SectionKey "${key}" is already registered; unregister it first`);
        }
        this._contributors.set(key, contributor);
        return () => {
            if (this._contributors.get(key) === contributor) {
                this._contributors.delete(key);
            }
        };
    }

    public Register(contributor: BaseDiagnosticContributor): () => void {
        return this.RegisterContributor(contributor);
    }

    public UnregisterContributor(sectionKey: string): void {
        this._contributors.delete(sectionKey);
    }

    public Unregister(sectionKey: string): void {
        this._contributors.delete(sectionKey);
    }

    public get ContributorKeys(): string[] {
        return Array.from(this._contributors.keys());
    }

    /**
     * Collects snapshots from all registered contributors in parallel, enforcing a per-contributor
     * timeout (`timeoutMs`, default 2000ms) and scrubbing each payload via `ScrubValue`.
     */
    public async CollectAll(
        context: DiagnosticContributionContext,
        timeoutMs: number = 2000
    ): Promise<Record<string, Record<string, unknown>>> {
        const entries = Array.from(this._contributors.entries());
        const out: Record<string, Record<string, unknown>> = {};

        await Promise.all(
            entries.map(async ([key, contributor]): Promise<void> => {
                let timer: ReturnType<typeof setTimeout> | undefined;
                try {
                    const timeoutPromise = new Promise<never>((_resolve, reject) => {
                        timer = setTimeout(
                            () => reject(new Error(`Contributor "${key}" timed out after ${timeoutMs}ms`)),
                            timeoutMs
                        );
                    });
                    const rawPayload = await Promise.race([
                        Promise.resolve(contributor.Collect(context)),
                        timeoutPromise,
                    ]);
                    out[key] = ScrubValue(rawPayload ?? {}, { scrubberProfile: context.scrubberProfile });
                } catch (err) {
                    out[key] = {
                        _error: err instanceof Error ? err.message : String(err),
                    };
                } finally {
                    if (timer !== undefined) {
                        clearTimeout(timer);
                    }
                }
            })
        );

        return out;
    }
}
