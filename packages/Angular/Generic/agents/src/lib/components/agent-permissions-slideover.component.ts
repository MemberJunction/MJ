import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, HostListener, NgZone, ChangeDetectorRef } from '@angular/core';
import { AIAgentEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * A slide-in panel from the right that wraps the AgentPermissionsPanel.
 * Includes a resizable edge handle and backdrop click-to-close.
 *
 * Usage:
 * ```html
 * <mj-agent-permissions-slideover
 *     *ngIf="showPanel"
 *     [Agent]="selectedAgent"
 *     (Closed)="showPanel = false"
 *     (PermissionsChanged)="onPermsChanged()">
 * </mj-agent-permissions-slideover>
 * ```
 */
@Component({
    selector: 'mj-agent-permissions-slideover',
    template: `
        <!-- Backdrop -->
        <div class="aps-backdrop" [class.aps-visible]="IsVisible" (click)="OnClose()"></div>

        <!-- Slide panel -->
        <div class="aps-panel" [class.aps-visible]="IsVisible" [style.width.px]="WidthPx">
            <!-- Resize handle -->
            <div class="aps-resize-handle" (mousedown)="OnResizeStart($event)">
                <div class="aps-resize-grip"></div>
            </div>

            <!-- Header -->
            <div class="aps-header">
                <div class="aps-title-group">
                    <i class="fa-solid fa-shield-halved aps-title-icon"></i>
                    <div>
                        <h2 class="aps-title">Permissions</h2>
                        <p class="aps-subtitle" *ngIf="Agent">{{ Agent.Name }}</p>
                    </div>
                </div>
                <button class="aps-close-btn" (click)="OnClose()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <!-- Content -->
            <div class="aps-body">
                <mj-agent-permissions-panel
                    [Agent]="Agent"
                    (PermissionsChanged)="PermissionsChanged.emit()">
                </mj-agent-permissions-panel>
            </div>
        </div>
    `,
    styles: [`
        .aps-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0);
            z-index: 1000;
            transition: background 0.3s ease;
            pointer-events: none;
        }
        .aps-backdrop.aps-visible {
            background: rgba(0, 0, 0, 0.3);
            pointer-events: auto;
        }

        .aps-panel {
            position: fixed;
            top: 0;
            right: 0;
            height: 100vh;
            background: var(--card-background, #ffffff);
            box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
            z-index: 1001;
            display: flex;
            flex-direction: column;
            transform: translateX(100%);
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            min-width: 400px;
            max-width: 92vw;
        }
        .aps-panel.aps-visible {
            transform: translateX(0);
        }

        .aps-resize-handle {
            position: absolute;
            left: -4px;
            top: 0;
            width: 8px;
            height: 100%;
            cursor: col-resize;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .aps-resize-handle:hover .aps-resize-grip,
        .aps-resize-handle:active .aps-resize-grip {
            opacity: 1;
            background: #6366f1;
        }
        .aps-resize-grip {
            width: 3px;
            height: 40px;
            background: var(--border-color, #d1d5db);
            border-radius: 3px;
            opacity: 0;
            transition: opacity 0.2s ease, background 0.2s ease;
        }
        .aps-resize-handle:hover {
            background: rgba(99, 102, 241, 0.04);
        }

        .aps-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px 16px;
            border-bottom: 1px solid var(--border-color, #e5e7eb);
            flex-shrink: 0;
        }

        .aps-title-group {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .aps-title-icon {
            font-size: 20px;
            color: #6366f1;
        }

        .aps-title {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            color: var(--text-primary, #1f2937);
        }

        .aps-subtitle {
            margin: 2px 0 0 0;
            font-size: 13px;
            color: #6b7280;
        }

        .aps-close-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            background: none;
            border: none;
            border-radius: 8px;
            color: var(--text-secondary, #6b7280);
            cursor: pointer;
            transition: all 0.15s ease;
            font-size: 16px;
            flex-shrink: 0;
        }
        .aps-close-btn:hover {
            background: var(--hover-background, #f3f4f6);
            color: var(--text-primary, #1f2937);
        }

        .aps-body {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
        }

        @media (max-width: 768px) {
            .aps-panel {
                width: 100% !important;
                min-width: unset;
            }
            .aps-resize-handle {
                display: none;
            }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgentPermissionsSlideoverComponent {
    @Input() Agent: AIAgentEntityExtended | null = null;
    @Output() Closed = new EventEmitter<void>();
    @Output() PermissionsChanged = new EventEmitter<void>();

    public IsVisible = false;
    public WidthPx = 560;

    private isResizing = false;
    private readonly minWidth = 400;
    private readonly maxWidthRatio = 0.92;
    private boundOnResizeMove = this.onResizeMove.bind(this);
    private boundOnResizeEnd = this.onResizeEnd.bind(this);

    constructor(
        private ngZone: NgZone,
        private cdr: ChangeDetectorRef
    ) {}

    ngOnInit(): void {
        Promise.resolve().then(() => {
            this.IsVisible = true;
            this.cdr.markForCheck();
        });
    }

    ngOnDestroy(): void {
        document.removeEventListener('mousemove', this.boundOnResizeMove);
        document.removeEventListener('mouseup', this.boundOnResizeEnd);
    }

    @HostListener('document:keydown.escape')
    public OnEscapeKey(): void {
        this.OnClose();
    }

    public OnClose(): void {
        this.IsVisible = false;
        this.cdr.markForCheck();
        setTimeout(() => this.Closed.emit(), 300);
    }

    // =========================================================================
    // Resize
    // =========================================================================

    public OnResizeStart(event: MouseEvent): void {
        event.preventDefault();
        this.isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        this.ngZone.runOutsideAngular(() => {
            document.addEventListener('mousemove', this.boundOnResizeMove);
            document.addEventListener('mouseup', this.boundOnResizeEnd);
        });
    }

    private onResizeMove(event: MouseEvent): void {
        if (!this.isResizing) return;
        const maxWidth = window.innerWidth * this.maxWidthRatio;
        this.WidthPx = Math.max(this.minWidth, Math.min(maxWidth, window.innerWidth - event.clientX));
        this.ngZone.run(() => this.cdr.markForCheck());
    }

    private onResizeEnd(): void {
        if (!this.isResizing) return;
        this.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', this.boundOnResizeMove);
        document.removeEventListener('mouseup', this.boundOnResizeEnd);
    }
}
