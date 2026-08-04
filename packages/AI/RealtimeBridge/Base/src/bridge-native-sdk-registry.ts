/**
 * @fileoverview `BridgeNativeSdkRegistry` — the per-`DriverClass` registry that lets the engine bind the
 * correct **native SDK factory** onto a freshly-resolved bridge driver at connect, WITHOUT the engine (or
 * the host) hard-coding per-provider wiring.
 *
 * ## The gap this closes
 * `AIBridgeEngine.StartBridgeSession` resolves the concrete driver via the `ClassFactory` (keyed by the
 * provider's `DriverClass`) but a freshly-constructed driver has **no SDK factory bound** — its default
 * `sdkFactory` throws "no SDK bound" at connect. Each provider package owns a `Bind<Provider>Native()`
 * factory, but the engine can't import all of them (that would couple it to every provider package) and
 * the SDK factory types are provider-specific (`ZoomMeetingSdkFactory` vs `TelephonyCallSdkFactory` …),
 * so there is no single generic `SetSdkFactory` the engine can call.
 *
 * ## The decoupling
 * Each provider registers a **type-erased binding closure** — `(driver: BaseRealtimeBridge) => void` — that
 * performs the typed `SetSdkFactory` INSIDE the provider package (where the concrete driver type is known),
 * keyed by its `DriverClass`. The engine then calls {@link Apply} with the resolved driver; the closure
 * does the cast + bind. No provider types leak to the engine, and no `any` is needed at the engine seam.
 *
 * Providers register their **native two-way** binding as the default (the intended default per the
 * Realtime Bridges program); a host can still override per-session via `StartBridgeSessionParams.BindSdk`
 * (e.g. to choose Zoom RTMS receive-only, or to inject a fake in a test).
 *
 * @module @memberjunction/ai-bridge-base
 * @author MemberJunction.com
 */

import { BaseSingleton } from '@memberjunction/global';
import { BaseRealtimeBridge } from './base-realtime-bridge';

/**
 * A type-erased binding that applies a provider's concrete SDK factory onto its resolved driver. The
 * closure is authored INSIDE the provider package, where the concrete `BaseRealtimeBridge` subclass is
 * known, so the necessary downcast + typed `SetSdkFactory(...)` stay confined there (never at the engine).
 *
 * @param driver The resolved bridge driver instance (the provider's own subclass at runtime).
 */
export type BridgeNativeSdkBinding = (driver: BaseRealtimeBridge) => void;

/**
 * Process-wide registry mapping a bridge provider's `DriverClass` to the binding that wires its native SDK
 * factory. A {@link BaseSingleton} (per the MJ singleton convention) so a single instance is shared across
 * the process even under bundler code duplication.
 *
 * Providers populate it on import (a tree-shake-safe `Register<Provider>NativeSdk()` call from their
 * `index.ts`, mirroring the existing `Load<Provider>Bridge()` registration pattern). The engine reads it
 * at {@link AIBridgeEngine.StartBridgeSession} time.
 */
export class BridgeNativeSdkRegistry extends BaseSingleton<BridgeNativeSdkRegistry> {
    /** DriverClass (lowercased+trimmed) → its native SDK binding closure. */
    private readonly bindings = new Map<string, BridgeNativeSdkBinding>();

    /** The singleton accessor (via the global object store). */
    public static get Instance(): BridgeNativeSdkRegistry {
        return super.getInstance<BridgeNativeSdkRegistry>();
    }

    /** Normalizes a `DriverClass` for case/whitespace-insensitive lookup (mirrors `EntityByName`). */
    private key(driverClass: string): string {
        return driverClass.trim().toLowerCase();
    }

    /**
     * Registers (or replaces) the native SDK binding for a `DriverClass`. Idempotent re-registration is
     * safe — the latest registration wins — so a package re-imported under code-splitting can't error.
     *
     * @param driverClass The provider's `DriverClass` (e.g. `'ZoomBridge'`).
     * @param binding The closure that binds the provider's native SDK factory onto a resolved driver.
     */
    public Register(driverClass: string, binding: BridgeNativeSdkBinding): void {
        if (!driverClass) {
            return;
        }
        this.bindings.set(this.key(driverClass), binding);
    }

    /** Whether a native SDK binding is registered for the given `DriverClass`. */
    public Has(driverClass: string): boolean {
        return !!driverClass && this.bindings.has(this.key(driverClass));
    }

    /**
     * Applies the registered native SDK binding (if any) onto a resolved driver. Safe no-op when no binding
     * is registered for the `DriverClass` — the driver keeps its default factory (which fails loudly at
     * connect if it actually needs an SDK), so an unregistered provider degrades gracefully.
     *
     * @param driverClass The provider's `DriverClass`.
     * @param driver The resolved driver to bind the SDK factory onto.
     * @returns `true` when a binding ran, `false` when none was registered.
     */
    public Apply(driverClass: string, driver: BaseRealtimeBridge): boolean {
        const binding = driverClass ? this.bindings.get(this.key(driverClass)) : undefined;
        if (!binding) {
            return false;
        }
        binding(driver);
        return true;
    }
}
