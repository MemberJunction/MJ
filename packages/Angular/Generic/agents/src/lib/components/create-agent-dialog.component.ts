import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, HostListener, ChangeDetectorRef } from '@angular/core';
import { CreateAgentConfig, CreateAgentResult } from './create-agent-panel.component';

/**
 * A centered modal dialog that wraps the CreateAgentPanel.
 * Use this when you want a focused, overlay-based agent creation experience.
 *
 * Usage:
 * ```html
 * <mj-create-agent-dialog
 *     *ngIf="showDialog"
 *     [Config]="{ Title: 'Create Agent' }"
 *     (Created)="onAgentCreated($event)"
 *     (Closed)="showDialog = false">
 * </mj-create-agent-dialog>
 * ```
 */
@Component({
  standalone: false,
    selector: 'mj-create-agent-dialog',
    template: `
        <!-- Backdrop -->
        <div class="cad-backdrop" [class.cad-visible]="IsVisible" (click)="OnClose()"></div>
        
        <!-- Dialog -->
        <div class="cad-dialog" [class.cad-visible]="IsVisible">
          <!-- Header -->
          <div class="cad-header">
            <div class="cad-title-group">
              <i class="fa-solid fa-robot cad-title-icon"></i>
              <div>
                <h2 class="cad-title">{{ DialogTitle }}</h2>
                @if (Config.ParentAgentName) {
                  <p class="cad-subtitle">
                    Sub-agent of {{ Config.ParentAgentName }}
                  </p>
                }
              </div>
            </div>
            <button class="cad-close-btn" (click)="OnClose()">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        
          <!-- Content -->
          <div class="cad-body">
            <mj-create-agent-panel
              [Config]="Config"
              (Created)="OnCreated($event)"
              (Cancelled)="OnClose()">
            </mj-create-agent-panel>
          </div>
        </div>
        `,
    styles: [`
        .cad-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0);
            z-index: 1000;
            transition: background 0.25s ease;
            pointer-events: none;
        }
        .cad-backdrop.cad-visible {
            background: rgba(0, 0, 0, 0.4);
            pointer-events: auto;
        }

        .cad-dialog {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.95);
            width: 680px;
            max-width: 95vw;
            max-height: 90vh;
            background: var(--card-background, #ffffff);
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
            z-index: 1001;
            display: flex;
            flex-direction: column;
            opacity: 0;
            transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .cad-dialog.cad-visible {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }

        .cad-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px 16px;
            border-bottom: 1px solid var(--border-color, #e5e7eb);
            flex-shrink: 0;
        }

        .cad-title-group {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .cad-title-icon {
            font-size: 22px;
            color: #6366f1;
        }

        .cad-title {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            color: var(--text-primary, #1f2937);
        }

        .cad-subtitle {
            margin: 2px 0 0 0;
            font-size: 13px;
            color: #6b7280;
        }

        .cad-close-btn {
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
        .cad-close-btn:hover {
            background: var(--hover-background, #f3f4f6);
            color: var(--text-primary, #1f2937);
        }

        .cad-body {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
        }

        @media (max-width: 768px) {
            .cad-dialog {
                width: 95vw;
                max-height: 95vh;
                border-radius: 12px;
            }
            .cad-header {
                padding: 16px 20px 12px;
            }
            .cad-body {
                padding: 16px;
            }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateAgentDialogComponent {
    @Input() Config: CreateAgentConfig = {};
    @Output() Created = new EventEmitter<CreateAgentResult>();
    @Output() Closed = new EventEmitter<void>();

    public IsVisible = false;

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        // Animate in on next microtask
        Promise.resolve().then(() => {
            this.IsVisible = true;
            this.cdr.markForCheck();
        });
    }

    public get DialogTitle(): string {
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
        setTimeout(() => this.Closed.emit(), 250);
    }
}
