import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { AIAgentEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * A centered modal dialog that wraps the AgentPermissionsPanel.
 * Use this when you want a focused, overlay-based permissions editor.
 *
 * Usage:
 * ```html
 * <mj-agent-permissions-dialog
 *     *ngIf="showDialog"
 *     [Agent]="selectedAgent"
 *     (Closed)="showDialog = false"
 *     (PermissionsChanged)="onPermsChanged()">
 * </mj-agent-permissions-dialog>
 * ```
 */
@Component({
  standalone: false,
    selector: 'mj-agent-permissions-dialog',
    template: `
        <!-- Backdrop -->
        <div class="apd-backdrop" [class.apd-visible]="IsVisible" (click)="OnClose()"></div>

        <!-- Dialog -->
        <div class="apd-dialog" [class.apd-visible]="IsVisible">
            <!-- Header -->
            <div class="apd-header">
                <div class="apd-title-group">
                    <i class="fa-solid fa-shield-halved apd-title-icon"></i>
                    <div>
                        <h2 class="apd-title">Manage Permissions</h2>
                        <p class="apd-subtitle" *ngIf="Agent">{{ Agent.Name }}</p>
                    </div>
                </div>
                <button class="apd-close-btn" (click)="OnClose()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <!-- Content -->
            <div class="apd-body">
                <mj-agent-permissions-panel
                    [Agent]="Agent"
                    (PermissionsChanged)="PermissionsChanged.emit()">
                </mj-agent-permissions-panel>
            </div>
        </div>
    `,
    styles: [`
        .apd-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0);
            z-index: 1000;
            transition: background 0.25s ease;
            pointer-events: none;
        }
        .apd-backdrop.apd-visible {
            background: rgba(0, 0, 0, 0.4);
            pointer-events: auto;
        }

        .apd-dialog {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.95);
            width: 640px;
            max-width: 95vw;
            max-height: 85vh;
            background: var(--card-background, #ffffff);
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
            z-index: 1001;
            display: flex;
            flex-direction: column;
            opacity: 0;
            transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .apd-dialog.apd-visible {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }

        .apd-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px 16px;
            border-bottom: 1px solid var(--border-color, #e5e7eb);
            flex-shrink: 0;
        }

        .apd-title-group {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .apd-title-icon {
            font-size: 20px;
            color: #6366f1;
        }

        .apd-title {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            color: var(--text-primary, #1f2937);
        }

        .apd-subtitle {
            margin: 2px 0 0 0;
            font-size: 13px;
            color: #6b7280;
        }

        .apd-close-btn {
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
        .apd-close-btn:hover {
            background: var(--hover-background, #f3f4f6);
            color: var(--text-primary, #1f2937);
        }

        .apd-body {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
        }

        @media (max-width: 768px) {
            .apd-dialog {
                width: 95vw;
                max-height: 90vh;
            }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [
        trigger('fadeIn', [
            transition(':enter', [
                style({ opacity: 0 }),
                animate('200ms ease-out', style({ opacity: 1 }))
            ])
        ])
    ]
})
export class AgentPermissionsDialogComponent {
    @Input() Agent: AIAgentEntityExtended | null = null;
    @Output() Closed = new EventEmitter<void>();
    @Output() PermissionsChanged = new EventEmitter<void>();

    public IsVisible = false;

    ngOnInit(): void {
        // Animate in on next microtask
        Promise.resolve().then(() => {
            this.IsVisible = true;
        });
    }

    @HostListener('document:keydown.escape')
    public OnEscapeKey(): void {
        this.OnClose();
    }

    public OnClose(): void {
        this.IsVisible = false;
        setTimeout(() => this.Closed.emit(), 250);
    }
}
