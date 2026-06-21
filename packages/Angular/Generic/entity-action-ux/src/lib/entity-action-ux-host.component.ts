/**
 * @fileoverview The host that turns a registered driver key into a live, context-fed component. A grid /
 * list / form drops `<mj-entity-action-ux-host>` into its template, binds the entity action's
 * `RuntimeUXDriverClass` + an {@link EntityActionUXContext}, and forwards the driver's outcome. The host
 * owns the ClassFactory resolution + dynamic mount so callers stay declarative.
 * @module @memberjunction/ng-entity-action-ux
 */
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnDestroy,
    Output,
    Type,
    ViewChild,
    ViewContainerRef,
    inject,
} from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import { Subscription } from 'rxjs';
import { BaseEntityActionRuntimeUX } from './base-entity-action-runtime-ux';
import type { EntityActionUXContext, EntityActionUXResult } from './runtime-ux-context';

@Component({
    selector: 'mj-entity-action-ux-host',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<ng-template #container></ng-template>`,
})
export class EntityActionUXHostComponent implements AfterViewInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);

    /** Registration key of the driver to mount (the entity action's `RuntimeUXDriverClass`). */
    @Input() DriverClass!: string;

    /** The work context handed to the driver. */
    @Input() Context!: EntityActionUXContext;

    /** Forwarded from the mounted driver when it finishes. */
    @Output() Completed = new EventEmitter<EntityActionUXResult>();

    /** Forwarded from the mounted driver when the user dismisses it. */
    @Output() Cancelled = new EventEmitter<void>();

    /** Emitted when the named driver can't be resolved (misconfiguration), so the host can fall back. */
    @Output() DriverNotFound = new EventEmitter<string>();

    @ViewChild('container', { read: ViewContainerRef }) private container!: ViewContainerRef;

    private subs: Subscription[] = [];

    ngAfterViewInit(): void {
        // Defer one microtask so the view is settled before we create the dynamic component.
        Promise.resolve().then(() => this.mount());
    }

    /** Resolves the driver class via the ClassFactory and mounts it with the context. */
    private mount(): void {
        if (!this.DriverClass) {
            this.DriverNotFound.emit('(empty)');
            return;
        }
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntityActionRuntimeUX, this.DriverClass);
        if (!registration) {
            this.DriverNotFound.emit(this.DriverClass);
            return;
        }

        this.container.clear();
        const ref = this.container.createComponent(registration.SubClass as Type<BaseEntityActionRuntimeUX>);
        const driver = ref.instance;
        driver.Context = this.Context;
        this.subs.push(driver.Completed.subscribe((r) => this.Completed.emit(r)));
        this.subs.push(driver.Cancelled.subscribe(() => this.Cancelled.emit()));

        void driver.Start();
        this.cdr.detectChanges();
    }

    ngOnDestroy(): void {
        this.subs.forEach((s) => s.unsubscribe());
        this.container?.clear();
    }
}
