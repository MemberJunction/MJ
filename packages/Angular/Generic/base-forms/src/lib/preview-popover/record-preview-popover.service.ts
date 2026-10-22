import {
    ApplicationRef,
    ComponentRef,
    EnvironmentInjector,
    Injectable,
    OnDestroy,
    createComponent,
    inject
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { CompositeKey, IMetadataProvider } from '@memberjunction/core';
import { Subscription } from 'rxjs';
import { FormNavigationEvent } from '../types/navigation-events';
import {
    MjRecordPreviewPopoverComponent,
    RecordPreviewAnchorRect,
    RecordPreviewUpdatedEvent
} from './record-preview-popover.component';

/**
 * Request payload to open the shared body-mounted `<mj-record-preview-popover>` overlay.
 */
export interface RecordPreviewOpenRequest {
    /** Unique identifier of the requesting directive/component instance. */
    SourceID: string;
    /** Target entity name. */
    EntityName: string;
    /** Target record primary key. */
    PrimaryKey: CompositeKey;
    /** Optional raw record ID string. */
    RecordID?: string | null;
    /** Optional pre-resolved display name for the target record. */
    DisplayName?: string | null;
    /** DOM element anchoring the popover; its live `getBoundingClientRect()` is read when opening. */
    AnchorElement?: HTMLElement | null;
    /** Explicit viewport anchor rectangle (used when `AnchorElement` is not provided). */
    AnchorRect?: RecordPreviewAnchorRect | null;
    /** Optional metadata provider override. */
    Provider?: IMetadataProvider | null;
    /** Hover intent delay in milliseconds before opening (defaults to `260`). */
    HoverDelayMs?: number;
    /** Callback invoked when the user clicks "Open Record" inside the popover. */
    OnNavigate?: (event: FormNavigationEvent) => void;
    /** Callback invoked when the user saves inline Quick Edit changes inside the popover. */
    OnRecordUpdated?: (event: RecordPreviewUpdatedEvent) => void;
}

/**
 * Root-scoped singleton service that manages a single body-mounted `<mj-record-preview-popover>`
 * overlay across the entire application.
 *
 * Benefits:
 * - **Zero idle DOM overhead**: No `<mj-record-preview-popover>` DOM nodes are created until the user
 *   actually hovers a record link.
 * - **Escapes `overflow: hidden` containers**: Mounting at `document.body` ensures preview cards on
 *   hero banners, table cells, and compact chips are never clipped.
 * - **100% DRY hover intent & quick-edit coordination**: Shared by `<mj-form-field>`, `<mj-record-links>`,
 *   `[mjRecordLink]`, and `<mj-record-link>`.
 */
@Injectable({ providedIn: 'root' })
export class MjRecordPreviewPopoverService implements OnDestroy {
    private static _fallbackNavigationHandler: ((event: FormNavigationEvent) => void) | null = null;

    /**
     * Optional application-level fallback handler for `FormNavigationEvent`s emitted by
     * `[mjRecordLink]` or `<mj-record-preview-popover>` when used outside a form container
     * without an explicit `(Navigate)` listener.
     */
    public static get FallbackNavigationHandler(): ((event: FormNavigationEvent) => void) | null {
        return MjRecordPreviewPopoverService._fallbackNavigationHandler;
    }
    public static set FallbackNavigationHandler(handler: ((event: FormNavigationEvent) => void) | null) {
        MjRecordPreviewPopoverService._fallbackNavigationHandler = handler;
    }

    private readonly appRef = inject(ApplicationRef);
    private readonly envInjector = inject(EnvironmentInjector);
    private readonly doc = inject(DOCUMENT);

    private popoverRef: ComponentRef<MjRecordPreviewPopoverComponent> | null = null;
    private popoverSubs: Subscription[] = [];
    private activeRequest: RecordPreviewOpenRequest | null = null;
    private pendingSourceId: string | null = null;
    private openTimer: ReturnType<typeof setTimeout> | null = null;
    private closeTimer: ReturnType<typeof setTimeout> | null = null;
    private docMouseDownListener: ((event: MouseEvent) => void) | null = null;

    /** ID of the source directive/component currently showing or waiting to show the popover. */
    public get ActiveSourceID(): string | null {
        return this.activeRequest?.SourceID ?? this.pendingSourceId;
    }

    /** True when the singleton popover is currently visible. */
    public get IsVisible(): boolean {
        return Boolean(this.popoverRef?.instance?.Visible);
    }

    /**
     * Schedules opening the record preview popover after the hover-intent delay (default `260ms`).
     */
    public RequestOpen(request: RecordPreviewOpenRequest): void {
        this.clearCloseTimer();
        this.clearOpenTimer();
        this.pendingSourceId = request.SourceID;
        const delayMs = request.HoverDelayMs ?? 260;

        if (delayMs <= 0) {
            this.openNow(request);
            return;
        }

        this.openTimer = setTimeout(() => {
            this.openTimer = null;
            this.openNow(request);
        }, delayMs);
    }

    /**
     * Schedules closing the record preview popover after a short grace period (default `180ms`)
     * so the pointer can travel from the link into the popover card.
     */
    public RequestClose(sourceId?: string, delayMs = 180): void {
        if (sourceId && this.pendingSourceId === sourceId) {
            this.clearOpenTimer();
            this.pendingSourceId = null;
        }
        if (sourceId && this.activeRequest && this.activeRequest.SourceID !== sourceId) {
            return;
        }
        // Keep the popover open while the user is actively typing in Quick Edit mode
        if (this.popoverRef?.instance?.IsEditing || this.popoverRef?.instance?.IsSavingEdit) {
            return;
        }
        this.clearCloseTimer();
        if (delayMs <= 0) {
            this.CloseImmediately();
            return;
        }
        this.closeTimer = setTimeout(() => {
            this.closeTimer = null;
            if (this.popoverRef?.instance?.IsEditing || this.popoverRef?.instance?.IsSavingEdit) {
                return;
            }
            this.CloseImmediately();
        }, delayMs);
    }

    /**
     * Immediately hides the record preview popover and cancels any pending hover timers.
     */
    public CloseImmediately(sourceId?: string): void {
        if (sourceId) {
            if (this.pendingSourceId === sourceId) {
                this.clearOpenTimer();
                this.pendingSourceId = null;
            }
            if (this.activeRequest && this.activeRequest.SourceID !== sourceId) {
                return;
            }
        } else {
            this.clearOpenTimer();
            this.pendingSourceId = null;
        }
        this.clearCloseTimer();
        this.activeRequest = null;
        if (this.popoverRef) {
            this.popoverRef.instance.Visible = false;
            this.popoverRef.changeDetectorRef.detectChanges();
        }
    }

    public ngOnDestroy(): void {
        this.clearOpenTimer();
        this.clearCloseTimer();
        this.removeDocumentListener();
        for (const sub of this.popoverSubs) {
            sub.unsubscribe();
        }
        this.popoverSubs = [];
        if (this.popoverRef) {
            this.appRef.detachView(this.popoverRef.hostView);
            this.popoverRef.destroy();
            this.popoverRef = null;
        }
    }

    private openNow(request: RecordPreviewOpenRequest): void {
        this.pendingSourceId = null;
        const anchorRect = this.resolveAnchorRect(request);
        if (!anchorRect) {
            return;
        }

        const ref = this.ensurePopoverComponent();
        this.activeRequest = request;

        const inst = ref.instance;
        inst.Provider = request.Provider ?? null;
        inst.EntityName = request.EntityName;
        inst.RecordID = request.RecordID ?? null;
        inst.PrimaryKey = request.PrimaryKey;
        inst.DisplayName = request.DisplayName ?? null;
        inst.AnchorRect = anchorRect;
        inst.Visible = true;
        ref.changeDetectorRef.detectChanges();
    }

    private resolveAnchorRect(request: RecordPreviewOpenRequest): RecordPreviewAnchorRect | null {
        if (request.AnchorElement && typeof request.AnchorElement.getBoundingClientRect === 'function') {
            if (!request.AnchorElement.isConnected) {
                return request.AnchorRect ?? null;
            }
            const r = request.AnchorElement.getBoundingClientRect();
            return {
                top: r.top,
                bottom: r.bottom,
                left: r.left,
                right: r.right,
                width: r.width,
                height: r.height
            };
        }
        return request.AnchorRect ?? null;
    }

    private ensurePopoverComponent(): ComponentRef<MjRecordPreviewPopoverComponent> {
        if (this.popoverRef) {
            return this.popoverRef;
        }

        const ref = createComponent(MjRecordPreviewPopoverComponent, {
            environmentInjector: this.envInjector
        });
        this.appRef.attachView(ref.hostView);
        const domElem = (ref.hostView as unknown as { rootNodes: HTMLElement[] }).rootNodes?.[0];
        if (domElem && this.doc?.body) {
            this.doc.body.appendChild(domElem);
        }

        this.popoverSubs.push(
            ref.instance.MouseEnterCard.subscribe(() => {
                this.clearCloseTimer();
            }),
            ref.instance.MouseLeaveCard.subscribe(() => {
                this.RequestClose(undefined, 180);
            }),
            ref.instance.Navigate.subscribe((navEvent: FormNavigationEvent) => {
                const req = this.activeRequest;
                this.CloseImmediately();
                if (req?.OnNavigate) {
                    req.OnNavigate(navEvent);
                } else if (MjRecordPreviewPopoverService._fallbackNavigationHandler) {
                    MjRecordPreviewPopoverService._fallbackNavigationHandler(navEvent);
                }
            }),
            ref.instance.RecordUpdated.subscribe((updatedEvent: RecordPreviewUpdatedEvent) => {
                const req = this.activeRequest;
                if (req?.OnRecordUpdated) {
                    req.OnRecordUpdated(updatedEvent);
                }
            })
        );

        this.installDocumentListener();
        this.popoverRef = ref;
        return ref;
    }

    private installDocumentListener(): void {
        if (this.docMouseDownListener || !this.doc) {
            return;
        }
        this.docMouseDownListener = (event: MouseEvent) => {
            if (!this.popoverRef?.instance?.Visible) {
                return;
            }
            const target = event.target as Node | null;
            const hostEl = (this.popoverRef.hostView as unknown as { rootNodes: HTMLElement[] }).rootNodes?.[0];
            if (target && hostEl && hostEl.contains(target)) {
                return;
            }
            if (target && this.activeRequest?.AnchorElement && this.activeRequest.AnchorElement.contains(target)) {
                return;
            }
            this.CloseImmediately();
        };
        this.doc.addEventListener('mousedown', this.docMouseDownListener, true);
    }

    private removeDocumentListener(): void {
        if (this.docMouseDownListener && this.doc) {
            this.doc.removeEventListener('mousedown', this.docMouseDownListener, true);
            this.docMouseDownListener = null;
        }
    }

    private clearOpenTimer(): void {
        if (this.openTimer) {
            clearTimeout(this.openTimer);
            this.openTimer = null;
        }
    }

    private clearCloseTimer(): void {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.closeTimer = null;
        }
    }
}
