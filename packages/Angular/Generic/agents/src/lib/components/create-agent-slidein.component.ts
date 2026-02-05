import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, HostListener, NgZone, ChangeDetectorRef } from '@angular/core';
import { CreateAgentConfig, CreateAgentResult } from './create-agent-panel.component';

/**
 * A slide-in panel from the right that wraps the CreateAgentPanel.
 * Includes a resizable edge handle and backdrop click-to-close.
 *
 * Usage:
 * ```html
 * <mj-create-agent-slidein
 *     *ngIf="showPanel"
 *     [Config]="{ Title: 'Create Agent' }"
 *     (Created)="onAgentCreated($event)"
 *     (Closed)="showPanel = false">
 * </mj-create-agent-slidein>
 * ```
 */
@Component({
    selector: 'mj-create-agent-slidein',
    template: `
        <!-- Backdrop -->
        <div class="cas-backdrop" [class.cas-visible]="IsVisible" (click)="OnClose()"></div>

        <!-- Slide panel -->
        <div class="cas-panel" [class.cas-visible]="IsVisible" [style.width.px]="WidthPx">
            <!-- Resize handle -->
            <div class="cas-resize-handle" (mousedown)="OnResizeStart($event)">
                <div class="cas-resize-grip"></div>
            </div>

            <!-- Header -->
            <div class="cas-header">
                <div class="cas-title-group">
                    <i class="fa-solid fa-robot cas-title-icon"></i>
                    <div>
                        <h2 class="cas-title">{{ PanelTitle }}</h2>
                        <p class="cas-subtitle" *ngIf="Config?.ParentAgentName">
                            Sub-agent of {{ Config.ParentAgentName }}
                        </p>
                    </div>
                </div>
                <button class="cas-close-btn" (click)="OnClose()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <!-- Content -->
            <div class="cas-body">
                <mj-create-agent-panel
                    [Config]="Config"
                    (Created)="OnCreated($event)"
                    (Cancelled)="OnClose()">
                </mj-create-agent-panel>
            </div>
        </div>
    `,
    styles: [`
        .cas-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0);
            z-index: 1000;
            transition: background 0.3s ease;
            pointer-events: none;
        }
        .cas-backdrop.cas-visible {
            background: rgba(0, 0, 0, 0.3);
            pointer-events: auto;
        }

        .cas-panel {
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
            min-width: 480px;
            max-width: 92vw;
        }
        .cas-panel.cas-visible {
            transform: translateX(0);
        }

        .cas-resize-handle {
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
        .cas-resize-handle:hover .cas-resize-grip,
        .cas-resize-handle:active .cas-resize-grip {
            opacity: 1;
            background: #6366f1;
        }
        .cas-resize-grip {
            width: 3px;
            height: 40px;
            background: var(--border-color, #d1d5db);
            border-radius: 3px;
            opacity: 0;
            transition: opacity 0.2s ease, background 0.2s ease;
        }
        .cas-resize-handle:hover {
            background: rgba(99, 102, 241, 0.04);
        }

        .cas-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px 16px;
            border-bottom: 1px solid var(--border-color, #e5e7eb);
            flex-shrink: 0;
        }

        .cas-title-group {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .cas-title-icon {
            font-size: 22px;
            color: #6366f1;
        }

        .cas-title {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            color: var(--text-primary, #1f2937);
        }

        .cas-subtitle {
            margin: 2px 0 0 0;
            font-size: 13px;
            color: #6b7280;
        }

        .cas-close-btn {
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
        .cas-close-btn:hover {
            background: var(--hover-background, #f3f4f6);
            color: var(--text-primary, #1f2937);
        }

        .cas-body {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
        }

        @media (max-width: 768px) {
            .cas-panel {
                width: 100% !important;
                min-width: unset;
            }
            .cas-resize-handle {
                display: none;
            }
            .cas-header {
                padding: 16px 20px 12px;
            }
            .cas-body {
                padding: 16px;
            }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateAgentSlideInComponent {
    @Input() Config: CreateAgentConfig = {};
    @Output() Created = new EventEmitter<CreateAgentResult>();
    @Output() Closed = new EventEmitter<void>();

    public IsVisible = false;
    public WidthPx = 640;

    private isResizing = false;
    private readonly minWidth = 480;
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

    public get PanelTitle(): string {
        if (this.Config?.Title) return this.Config.Title;
        return this.Config?.ParentAgentId ? 'Create Sub-Agent' : 'Create New Agent';
    }

    @HostListener('document:keydown.escape')
    public OnEscapeKey(): void {
        this.OnClose();
    }

    public OnCreated(result: CreateAgentResult): void {
        this.Created.emit(result);
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
