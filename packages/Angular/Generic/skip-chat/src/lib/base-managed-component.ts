import { OnDestroy, Directive } from '@angular/core';
import { resourceManager } from '@memberjunction/react-runtime';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Base class for Angular components that provides automatic resource cleanup.
 * Uses React Runtime's resource manager for centralized management.
 */
@Directive()
export abstract class BaseManagedComponent extends BaseAngularComponent implements OnDestroy {
    protected componentId: string;

    constructor() {
        super();
        // Generate unique component ID for resource tracking
        this.componentId = `${this.constructor.name}-${Date.now()}-${Math.random()}`;
    }

    /**
     * Wrapper for setTimeout that automatically tracks and cleans up timeouts
     */
    protected setTimeout(callback: () => void, delay: number, metadata?: Record<string, any>): number {
        return resourceManager.setTimeout(this.componentId, callback, delay, metadata);
    }

    /**
     * Wrapper for setInterval that automatically tracks and cleans up intervals
     */
    protected setInterval(callback: () => void, delay: number, metadata?: Record<string, any>): number {
        return resourceManager.setInterval(this.componentId, callback, delay, metadata);
    }

    /**
     * Clear a specific timeout
     */
    protected clearTimeout(id: number): void {
        resourceManager.clearTimeout(this.componentId, id);
    }

    /**
     * Clear a specific interval
     */
    protected clearInterval(id: number): void {
        resourceManager.clearInterval(this.componentId, id);
    }

    /**
     * Register an event listener with automatic cleanup
     */
    protected addEventListener(
        target: EventTarget,
        type: string,
        listener: EventListener,
        options?: AddEventListenerOptions
    ): void {
        resourceManager.addEventListener(this.componentId, target, type, listener, options);
    }

    /**
     * Register a cleanup callback to be called on component destroy
     */
    protected registerCleanup(cleanup: () => void): void {
        resourceManager.registerCleanup(this.componentId, cleanup);
    }

    ngOnDestroy(): void {
        // Clean up all resources associated with this component
        resourceManager.cleanupComponent(this.componentId);
    }
}