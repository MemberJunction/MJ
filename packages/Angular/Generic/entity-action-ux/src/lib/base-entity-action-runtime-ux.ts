/**
 * @fileoverview The plugin contract for an entity-action runtime UX. A concrete driver is a standalone
 * Angular component that extends this base and registers itself with `@RegisterClass(BaseEntityActionRuntimeUX,
 * '<DriverKey>')`. The host ({@link EntityActionUXHostComponent}) resolves the key via the MJ ClassFactory,
 * mounts the component, hands it a {@link EntityActionUXContext}, calls {@link Start}, and listens for the
 * `Completed` / `Cancelled` outputs. New drivers ship in this package or any consumer — no host changes.
 * @module @memberjunction/ng-entity-action-ux
 */
import { Directive, EventEmitter, Input, Output } from '@angular/core';
import type { EntityActionUXContext, EntityActionUXResult } from './runtime-ux-context';

/**
 * Abstract base for a runtime-UX driver. `@Directive()` (not `@Component`) so it can be a decorated,
 * DI-capable base class without its own template; concrete drivers supply the `@Component`.
 */
@Directive()
export abstract class BaseEntityActionRuntimeUX {
    /** The work context, set by the host immediately after construction (before {@link Start}). */
    @Input() Context!: EntityActionUXContext;

    /** Emit when the driver has finished its work (applied or not — see {@link EntityActionUXResult}). */
    @Output() Completed = new EventEmitter<EntityActionUXResult>();

    /** Emit when the user dismisses the driver without completing. */
    @Output() Cancelled = new EventEmitter<void>();

    /**
     * Begin the driver's flow. Called once by the host after `Context` is set. Implementations typically
     * kick off an async preview/load here and drive their own template state from it.
     */
    abstract Start(): void | Promise<void>;
}
