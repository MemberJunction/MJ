/**
 * @fileoverview Typed Cross-App Capability Registry (`AppCapabilityRegistry` & `@RegisterAppCapability`).
 *
 * Enables optional sibling OpenApps and framework extensions to expose and consume strongly-typed
 * cross-application capabilities without hard package-graph dependencies or fragile untyped string
 * remote-operation lookups.
 *
 * Providers decorate implementation classes with `@RegisterAppCapability(ContractToken, options)`.
 * TypeScript verifies at compile time that the class's `Execute(input, context)` method matches the
 * `CapabilityContract<TInput, TOutput>` token's `TInput` and `TOutput` types. Consumers invoke
 * `AppCapabilityRegistry.Instance.ExecuteIfAvailable(ContractToken, input, context)` or
 * `ExecuteRequired(...)` with full end-to-end type inference and automatic host-entity readiness checks.
 *
 * @module @memberjunction/core
 */

import { BaseSingleton } from '@memberjunction/global';
import type { IMetadataProvider } from './interfaces';
import type { UserInfo } from './securityInfo';

/**
 * Strongly-typed, zero-dependency contract token shared between capability providers and consumers.
 */
export interface CapabilityContract<TInput, TOutput> {
    readonly Key: string;
    readonly Version: number;
    readonly Description?: string;
    /** Compile-time phantom type carrier — never populated at runtime. */
    readonly __phantomTypes?: {
        readonly input: TInput;
        readonly output: TOutput;
    };
}

/**
 * Defines an immutable, strongly-typed {@link CapabilityContract} token.
 */
export function DefineCapabilityContract<TInput, TOutput>(
    key: string,
    version: number = 1,
    description?: string,
): CapabilityContract<TInput, TOutput> {
    if (!key || key.trim().length === 0) {
        throw new Error('DefineCapabilityContract: capability key must be a non-empty string.');
    }
    return Object.freeze({
        Key: key.trim(),
        Version: version,
        Description: description,
    });
}

export interface AppCapabilityExecutionContext {
    readonly ContextUser: UserInfo;
    readonly Provider: IMetadataProvider;
}

export interface IAppCapabilityProvider<TInput, TOutput> {
    /**
     * Optional dynamic readiness probe (e.g. checking tenant feature flags or external configuration).
     * Combined with `RegisterAppCapabilityOptions.requiredEntities`.
     */
    IsAvailable?(context: AppCapabilityExecutionContext): boolean | Promise<boolean>;
    Execute(input: TInput, context: AppCapabilityExecutionContext): Promise<TOutput>;
}

export type AppCapabilityConstructor<TInput, TOutput> = new () => IAppCapabilityProvider<TInput, TOutput>;

export interface RegisterAppCapabilityOptions {
    /** Higher priority wins when multiple providers register for the same capability key. Default `0`. */
    readonly priority?: number;
    /** Owning OpenApp or package identifier for diagnostics (e.g. `'@mj-biz-apps/contracts'`). */
    readonly ownerApp?: string;
    /** Entity names that MUST exist in `context.Provider.Entities` for this capability to report available. */
    readonly requiredEntities?: ReadonlyArray<string>;
}

export interface AppCapabilityRegistration<TInput, TOutput> {
    readonly Contract: CapabilityContract<TInput, TOutput>;
    readonly ProviderClass: AppCapabilityConstructor<TInput, TOutput>;
    readonly Priority: number;
    readonly OwnerApp?: string;
    readonly RequiredEntities?: ReadonlyArray<string>;
    readonly Sequence: number;
}

export type CapabilityUnavailableReason = 'NotRegistered' | 'HostEntitiesMissing' | 'ProviderUnavailable';

export interface CapabilityOptionalResult<TOutput> {
    readonly Executed: boolean;
    readonly Result?: TOutput;
    readonly OwnerApp?: string;
    readonly Reason?: CapabilityUnavailableReason;
}

export interface CapabilityAvailabilityResult<TInput, TOutput> {
    readonly Available: boolean;
    readonly Provider?: IAppCapabilityProvider<TInput, TOutput>;
    readonly OwnerApp?: string;
    readonly Reason?: CapabilityUnavailableReason;
}

interface InternalCapabilityEntry {
    readonly key: string;
    readonly version: number;
    readonly description?: string;
    readonly providerRef: Function;
    readonly priority: number;
    readonly ownerApp?: string;
    readonly requiredEntities?: ReadonlyArray<string>;
    readonly sequence: number;
}

/**
 * Process-wide singleton registry for typed cross-app capabilities.
 */
export class AppCapabilityRegistry extends BaseSingleton<AppCapabilityRegistry> {
    private readonly _registrations = new Map<string, InternalCapabilityEntry[]>();
    private _sequenceCounter = 0;

    public constructor() {
        super();
    }

    public static get Instance(): AppCapabilityRegistry {
        return super.getInstance<AppCapabilityRegistry>();
    }

    public Register<TInput, TOutput>(
        contract: CapabilityContract<TInput, TOutput>,
        providerClass: AppCapabilityConstructor<TInput, TOutput>,
        options?: RegisterAppCapabilityOptions,
    ): void {
        const normalizedKey = this.normalizeKey(contract.Key);
        const list = this._registrations.get(normalizedKey) ?? [];
        const entry: InternalCapabilityEntry = {
            key: contract.Key,
            version: contract.Version,
            description: contract.Description,
            providerRef: providerClass,
            priority: options?.priority ?? 0,
            ownerApp: options?.ownerApp,
            requiredEntities: options?.requiredEntities ? [...options.requiredEntities] : undefined,
            sequence: ++this._sequenceCounter,
        };
        list.push(entry);
        this._registrations.set(normalizedKey, list);
    }

    public Unregister<TInput, TOutput>(
        contract: CapabilityContract<TInput, TOutput>,
        providerClass?: AppCapabilityConstructor<TInput, TOutput>,
    ): void {
        const normalizedKey = this.normalizeKey(contract.Key);
        if (!providerClass) {
            this._registrations.delete(normalizedKey);
            return;
        }
        const list = this._registrations.get(normalizedKey);
        if (!list) {
            return;
        }
        const filtered = list.filter((e) => e.providerRef !== providerClass);
        if (filtered.length === 0) {
            this._registrations.delete(normalizedKey);
        } else {
            this._registrations.set(normalizedKey, filtered);
        }
    }

    public Clear(): void {
        this._registrations.clear();
        this._sequenceCounter = 0;
    }

    public IsRegistered<TInput, TOutput>(contract: CapabilityContract<TInput, TOutput>): boolean {
        return this.selectWinningEntry(contract.Key) !== null;
    }

    public ResolveRegistration<TInput, TOutput>(
        contract: CapabilityContract<TInput, TOutput>,
    ): AppCapabilityRegistration<TInput, TOutput> | null {
        const winner = this.selectWinningEntry(contract.Key);
        if (!winner) {
            return null;
        }
        return {
            Contract: contract,
            ProviderClass: winner.providerRef as AppCapabilityConstructor<TInput, TOutput>,
            Priority: winner.priority,
            OwnerApp: winner.ownerApp,
            RequiredEntities: winner.requiredEntities,
            Sequence: winner.sequence,
        };
    }

    public Resolve<TInput, TOutput>(
        contract: CapabilityContract<TInput, TOutput>,
    ): IAppCapabilityProvider<TInput, TOutput> | null {
        const reg = this.ResolveRegistration(contract);
        if (!reg) {
            return null;
        }
        return new reg.ProviderClass();
    }

    public async CheckAvailability<TInput, TOutput>(
        contract: CapabilityContract<TInput, TOutput>,
        context: AppCapabilityExecutionContext,
    ): Promise<CapabilityAvailabilityResult<TInput, TOutput>> {
        const reg = this.ResolveRegistration(contract);
        if (!reg) {
            return { Available: false, Reason: 'NotRegistered' };
        }
        if (reg.RequiredEntities && reg.RequiredEntities.length > 0) {
            const hostEntityNames = new Set(
                (context.Provider.Entities ?? []).map((e) => e.Name.trim().toLowerCase()),
            );
            for (const required of reg.RequiredEntities) {
                if (!hostEntityNames.has(required.trim().toLowerCase())) {
                    return { Available: false, Reason: 'HostEntitiesMissing' };
                }
            }
        }
        const provider = new reg.ProviderClass();
        if (provider.IsAvailable) {
            const ok = await provider.IsAvailable(context);
            if (!ok) {
                return { Available: false, Reason: 'ProviderUnavailable' };
            }
        }
        return { Available: true, Provider: provider, OwnerApp: reg.OwnerApp };
    }

    public async IsAvailable<TInput, TOutput>(
        contract: CapabilityContract<TInput, TOutput>,
        context: AppCapabilityExecutionContext,
    ): Promise<boolean> {
        const check = await this.CheckAvailability(contract, context);
        return check.Available;
    }

    public async ExecuteIfAvailable<TInput, TOutput>(
        contract: CapabilityContract<TInput, TOutput>,
        input: TInput,
        context: AppCapabilityExecutionContext,
    ): Promise<CapabilityOptionalResult<TOutput>> {
        const check = await this.CheckAvailability(contract, context);
        if (!check.Available) {
            return { Executed: false, Reason: check.Reason };
        }
        const result = await check.Provider.Execute(input, context);
        return { Executed: true, Result: result, OwnerApp: check.OwnerApp };
    }

    public async ExecuteRequired<TInput, TOutput>(
        contract: CapabilityContract<TInput, TOutput>,
        input: TInput,
        context: AppCapabilityExecutionContext,
    ): Promise<TOutput> {
        const outcome = await this.ExecuteIfAvailable(contract, input, context);
        if (!outcome.Executed) {
            throw new Error(
                `Required app capability '${contract.Key}' (v${contract.Version}) is unavailable: ${outcome.Reason}.`,
            );
        }
        return outcome.Result;
    }

    private selectWinningEntry(key: string): InternalCapabilityEntry | null {
        const list = this._registrations.get(this.normalizeKey(key));
        if (!list || list.length === 0) {
            return null;
        }
        let best = list[0];
        for (let i = 1; i < list.length; i++) {
            const candidate = list[i];
            if (
                candidate.priority > best.priority ||
                (candidate.priority === best.priority && candidate.sequence >= best.sequence)
            ) {
                best = candidate;
            }
        }
        return best;
    }

    private normalizeKey(key: string): string {
        return key.trim().toLowerCase();
    }
}

/**
 * Class decorator that registers an {@link IAppCapabilityProvider} implementation against a typed
 * {@link CapabilityContract}, enforcing input/output type compatibility at compile time.
 */
export function RegisterAppCapability<TInput, TOutput>(
    contract: CapabilityContract<TInput, TOutput>,
    options?: RegisterAppCapabilityOptions,
): (target: AppCapabilityConstructor<TInput, TOutput>) => void {
    return (target: AppCapabilityConstructor<TInput, TOutput>): void => {
        AppCapabilityRegistry.Instance.Register(contract, target, options);
    };
}
