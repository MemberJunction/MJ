import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { PopoverModule } from 'primeng/popover';
import { DrawerModule } from 'primeng/drawer';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogModule, DynamicDialogRef, DynamicDialogConfig, DialogService } from 'primeng/dynamicdialog';
import { ConfirmationService } from 'primeng/api';

@Component({
    selector: 'app-dynamic-dialog-content',
    standalone: true,
    template: `
        <div style="padding: var(--mj-space-4);">
            <p style="color: var(--mj-text-secondary); font-size: var(--mj-text-sm); line-height: var(--mj-leading-relaxed); margin: 0 0 var(--mj-space-3) 0;">
                This content was loaded dynamically via <code style="font-family: var(--mj-font-family-mono); font-size: var(--mj-text-xs); color: var(--mj-brand-primary); background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent); padding: 2px 6px; border-radius: 4px;">DialogService.open()</code>.
                Any Angular component can be rendered inside a DynamicDialog.
            </p>
            <p style="color: var(--mj-text-muted); font-size: var(--mj-text-xs); margin: 0;">
                Data passed: {{ Config.data?.message || 'No data' }}
            </p>
            <div style="margin-top: var(--mj-space-4);">
                <button pButton label="Close" class="p-button-primary p-button-sm" (click)="Close()"></button>
            </div>
        </div>
    `,
    imports: [ButtonModule]
})
export class DynamicDialogContentComponent {
    Ref = inject(DynamicDialogRef);
    Config = inject(DynamicDialogConfig);

    Close() {
        this.Ref.close();
    }
}

@Component({
    selector: 'app-overlays',
    standalone: true,
    imports: [
        CommonModule,
        DialogModule,
        ConfirmDialogModule,
        ConfirmPopupModule,
        PopoverModule,
        DrawerModule,
        TooltipModule,
        ButtonModule,
        DynamicDialogModule
    ],
    providers: [ConfirmationService],
    template: `
    <div class="overlays-page">
        <!-- Dialog Section -->
        <section class="token-section">
            <h2>Dialog</h2>
            <p class="section-desc">Modal dialog with header, content, and footer actions. Uses MJ surface and shadow tokens for elevation.</p>
            <p class="token-mapping">Background: --mj-bg-surface-elevated | Shadow: --mj-shadow-lg | Header border: --mj-border-default</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Open Dialog" icon="pi pi-external-link" class="p-button-primary" (click)="ShowDialog = true"></button>
            </div>

            <p-dialog
                header="Sample Dialog"
                [(visible)]="ShowDialog"
                [modal]="true"
                [draggable]="false"
                [resizable]="false"
                [style]="{ width: '480px' }">
                <p class="dialog-body">
                    This is a basic PrimeNG dialog styled with MJ design tokens. The header uses
                    <code>--mj-text-primary</code> for text and <code>--mj-border-default</code>
                    for the bottom border. The backdrop uses a semi-transparent overlay.
                </p>
                <ng-template pTemplate="footer">
                    <div class="mj-grid mj-gap-2 dialog-footer">
                        <button pButton label="Confirm" icon="pi pi-check" class="p-button-primary" (click)="ShowDialog = false"></button>
                        <button pButton label="Cancel" class="p-button-text" (click)="ShowDialog = false"></button>
                    </div>
                </ng-template>
            </p-dialog>
        </section>

        <!-- ConfirmDialog Section -->
        <section class="token-section">
            <h2>ConfirmDialog</h2>
            <p class="section-desc">Declarative confirmation dialog driven by the ConfirmationService. Ideal for delete/destructive actions.</p>
            <p class="token-mapping">Accept button: --mj-status-error-* | Reject button: --mj-text-secondary</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Delete Record" icon="pi pi-trash" class="p-button-danger" (click)="ConfirmDelete($event)"></button>
                <button pButton label="Save Changes" icon="pi pi-save" class="p-button-primary" (click)="ConfirmSave($event)"></button>
            </div>

            <p-confirmDialog></p-confirmDialog>

            @if (LastConfirmResult) {
                <div class="result-message">
                    <i class="pi pi-info-circle"></i>
                    <span>{{ LastConfirmResult }}</span>
                </div>
            }
        </section>

        <!-- ConfirmPopup Section -->
        <section class="token-section">
            <h2>ConfirmPopup</h2>
            <p class="section-desc">Lightweight confirmation popup that appears inline near the trigger element instead of a centered modal.</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Archive Item" icon="pi pi-inbox" class="p-button-warning" (click)="ConfirmPopup($event)"></button>
            </div>

            <p-confirmpopup></p-confirmpopup>

            @if (LastPopupResult) {
                <div class="result-message">
                    <i class="pi pi-info-circle"></i>
                    <span>{{ LastPopupResult }}</span>
                </div>
            }
        </section>

        <!-- OverlayPanel Section -->
        <section class="token-section">
            <h2>OverlayPanel</h2>
            <p class="section-desc">Floating panel that appears on click, useful for contextual information, quick actions, or preview cards.</p>
            <p class="token-mapping">Background: --mj-bg-surface-elevated | Shadow: --mj-shadow-md | Border: --mj-border-default</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Show Details" icon="pi pi-info-circle" class="p-button-outlined" (click)="op.toggle($event)"></button>
                <button pButton label="Quick Actions" icon="pi pi-bolt" class="p-button-secondary" (click)="opActions.toggle($event)"></button>
            </div>

            <p-popover #op>
                <div class="overlay-content">
                    <h4>Record Details</h4>
                    <div class="mj-grid mj-flex-nowrap mj-justify-between mj-align-center overlay-detail-row">
                        <span class="overlay-label">Entity:</span>
                        <span class="overlay-value">AI Prompts</span>
                    </div>
                    <div class="mj-grid mj-flex-nowrap mj-justify-between mj-align-center overlay-detail-row">
                        <span class="overlay-label">Status:</span>
                        <span class="overlay-value status-active">Active</span>
                    </div>
                    <div class="mj-grid mj-flex-nowrap mj-justify-between mj-align-center overlay-detail-row">
                        <span class="overlay-label">Last Modified:</span>
                        <span class="overlay-value">Feb 4, 2026</span>
                    </div>
                    <div class="mj-grid mj-flex-nowrap mj-justify-between mj-align-center overlay-detail-row">
                        <span class="overlay-label">Owner:</span>
                        <span class="overlay-value">Admin User</span>
                    </div>
                </div>
            </p-popover>

            <p-popover #opActions>
                <div class="mj-grid mj-flex-column overlay-actions">
                    <button pButton label="Edit" icon="pi pi-pencil" class="p-button-text p-button-sm" (click)="opActions.hide()"></button>
                    <button pButton label="Duplicate" icon="pi pi-copy" class="p-button-text p-button-sm" (click)="opActions.hide()"></button>
                    <button pButton label="Export" icon="pi pi-download" class="p-button-text p-button-sm" (click)="opActions.hide()"></button>
                    <button pButton label="Delete" icon="pi pi-trash" class="p-button-text p-button-danger p-button-sm" (click)="opActions.hide()"></button>
                </div>
            </p-popover>
        </section>

        <!-- Sidebar Section -->
        <section class="token-section">
            <h2>Sidebar</h2>
            <p class="section-desc">Off-canvas panel that slides in from any edge. Commonly used for navigation, filters, or detail views.</p>
            <p class="token-mapping">Background: --mj-bg-surface | Border: --mj-border-default | Overlay: semi-transparent backdrop</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Left Sidebar" icon="pi pi-arrow-right" class="p-button-primary" (click)="ShowSidebarLeft = true"></button>
                <button pButton label="Right Sidebar" icon="pi pi-arrow-left" class="p-button-secondary" (click)="ShowSidebarRight = true"></button>
            </div>

            <p-drawer [(visible)]="ShowSidebarLeft" [modal]="true" header="Navigation">
                <div class="mj-grid mj-flex-column mj-gap-4 sidebar-content">
                    <p class="sidebar-text">This sidebar slides in from the left. It uses <code>--mj-bg-surface</code> for the background and
                    <code>--mj-border-default</code> for the edge border.</p>
                    <div class="mj-grid mj-flex-column mj-gap-1 sidebar-nav-list">
                        <div class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center sidebar-nav-item">
                            <i class="pi pi-home"></i>
                            <span>Dashboard</span>
                        </div>
                        <div class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center sidebar-nav-item">
                            <i class="pi pi-users"></i>
                            <span>Users</span>
                        </div>
                        <div class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center sidebar-nav-item">
                            <i class="pi pi-cog"></i>
                            <span>Settings</span>
                        </div>
                        <div class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center sidebar-nav-item">
                            <i class="pi pi-chart-bar"></i>
                            <span>Analytics</span>
                        </div>
                        <div class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center sidebar-nav-item">
                            <i class="pi pi-question-circle"></i>
                            <span>Help &amp; Support</span>
                        </div>
                    </div>
                </div>
            </p-drawer>

            <p-drawer [(visible)]="ShowSidebarRight" position="right" [modal]="true" header="Record Details">
                <div class="mj-grid mj-flex-column mj-gap-4 sidebar-content">
                    <p class="sidebar-text">Right-positioned sidebar for detail views and contextual information.</p>
                    <div class="sidebar-detail-card">
                        <h4>AI Prompt #1247</h4>
                        <div class="mj-grid mj-flex-nowrap mj-justify-between mj-align-center sidebar-detail-row">
                            <span class="sidebar-detail-label">Name</span>
                            <span class="sidebar-detail-value">Summarize Content</span>
                        </div>
                        <div class="mj-grid mj-flex-nowrap mj-justify-between mj-align-center sidebar-detail-row">
                            <span class="sidebar-detail-label">Category</span>
                            <span class="sidebar-detail-value">Text Processing</span>
                        </div>
                        <div class="mj-grid mj-flex-nowrap mj-justify-between mj-align-center sidebar-detail-row">
                            <span class="sidebar-detail-label">Status</span>
                            <span class="sidebar-detail-value status-active">Active</span>
                        </div>
                        <div class="mj-grid mj-flex-nowrap mj-justify-between mj-align-center sidebar-detail-row">
                            <span class="sidebar-detail-label">Created</span>
                            <span class="sidebar-detail-value">Jan 15, 2026</span>
                        </div>
                    </div>
                    <div class="mj-grid mj-gap-2 sidebar-actions">
                        <button pButton label="Edit Record" icon="pi pi-pencil" class="p-button-primary p-button-sm"></button>
                        <button pButton label="Close" class="p-button-text p-button-sm" (click)="ShowSidebarRight = false"></button>
                    </div>
                </div>
            </p-drawer>
        </section>

        <!-- Tooltip Section -->
        <section class="token-section">
            <h2>Tooltip</h2>
            <p class="section-desc">Informational popups that appear on hover. Supports multiple positions and can be applied to any element via the pTooltip directive.</p>
            <p class="token-mapping">Background: --mj-text-primary (inverted) | Text: --mj-bg-surface | Radius: --mj-radius-md</p>

            <h3 class="subsection-title">Positions</h3>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Top" class="p-button-outlined" pTooltip="Tooltip on top" tooltipPosition="top"></button>
                <button pButton label="Right" class="p-button-outlined" pTooltip="Tooltip on right" tooltipPosition="right"></button>
                <button pButton label="Bottom" class="p-button-outlined" pTooltip="Tooltip on bottom" tooltipPosition="bottom"></button>
                <button pButton label="Left" class="p-button-outlined" pTooltip="Tooltip on left" tooltipPosition="left"></button>
            </div>

            <h3 class="subsection-title">On Various Elements</h3>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <span class="tooltip-badge" pTooltip="3 unread notifications" tooltipPosition="top">
                    <i class="pi pi-bell"></i>
                    Notifications
                </span>
                <span class="tooltip-badge" pTooltip="Click to view your profile settings" tooltipPosition="top">
                    <i class="pi pi-user"></i>
                    Profile
                </span>
                <span class="tooltip-badge tooltip-help" pTooltip="This action cannot be undone. All associated data will be permanently removed." tooltipPosition="bottom">
                    <i class="pi pi-question-circle"></i>
                    What does delete do?
                </span>
            </div>

            <h3 class="subsection-title">Icon Buttons with Tooltips</h3>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton icon="pi pi-pencil" class="p-button-rounded p-button-text" pTooltip="Edit" tooltipPosition="top"></button>
                <button pButton icon="pi pi-trash" class="p-button-rounded p-button-text p-button-danger" pTooltip="Delete" tooltipPosition="top"></button>
                <button pButton icon="pi pi-copy" class="p-button-rounded p-button-text" pTooltip="Duplicate" tooltipPosition="top"></button>
                <button pButton icon="pi pi-download" class="p-button-rounded p-button-text" pTooltip="Export" tooltipPosition="top"></button>
                <button pButton icon="pi pi-refresh" class="p-button-rounded p-button-text" pTooltip="Refresh Data" tooltipPosition="top"></button>
            </div>
        </section>

        <!-- DynamicDialog Section -->
        <section class="token-section">
            <h2>DynamicDialog</h2>
            <p class="section-desc">Programmatically opened dialog via DialogService. Any component can be loaded as content at runtime, making it ideal for reusable dialog patterns.</p>
            <p class="token-mapping">Uses Dialog styling tokens | Opened via DialogService.open() (provided in app.config.ts)</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Open Dynamic Dialog" icon="pi pi-external-link" class="p-button-primary" (click)="OpenDynamicDialog()"></button>
            </div>

            <div class="dynamic-dialog-note">
                <i class="pi pi-info-circle"></i>
                <span>DynamicDialog uses <code>DialogService.open(ComponentType, config)</code> to render any component inside a dialog at runtime. The child component can inject <code>DynamicDialogRef</code> and <code>DynamicDialogConfig</code> for communication.</span>
            </div>
        </section>
    </div>
    `,
    styles: [`
    .overlays-page {
        max-width: 900px;
    }

    .token-section {
        margin-bottom: var(--mj-space-12);
    }

    .token-section h2 {
        font-size: var(--mj-text-2xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-primary);
        margin: 0 0 var(--mj-space-2) 0;
    }

    .section-desc {
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        margin: 0 0 var(--mj-space-2) 0;
        line-height: var(--mj-leading-relaxed);
    }

    .token-mapping {
        font-family: var(--mj-font-family-mono);
        font-size: 11px;
        color: var(--mj-text-muted);
        margin: 0 0 var(--mj-space-5) 0;
    }

    .subsection-title {
        font-size: var(--mj-text-base);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
        margin: var(--mj-space-5) 0 var(--mj-space-1) 0;
    }

    .component-row {
        margin-bottom: var(--mj-space-4);
    }

    /* Dialog */
    .dialog-body {
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        line-height: var(--mj-leading-relaxed);
        margin: 0;
    }

    .dialog-footer {
    }

    /* Result message */
    .result-message {
        display: inline-flex;
        align-items: center;
        gap: var(--mj-space-2);
        padding: var(--mj-space-2) var(--mj-space-4);
        background: color-mix(in srgb, var(--mj-status-info-bg) 60%, transparent);
        border: 1px solid var(--mj-status-info-text);
        border-radius: var(--mj-radius-md);
        font-size: var(--mj-text-sm);
        color: var(--mj-status-info-text);
        margin-top: var(--mj-space-2);
    }

    .result-message i {
        font-size: var(--mj-text-base);
    }

    /* OverlayPanel content */
    .overlay-content {
        min-width: 240px;

        h4 {
            margin: 0 0 var(--mj-space-3) 0;
            font-size: var(--mj-text-base);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-primary);
        }
    }

    .overlay-detail-row {
        padding: var(--mj-space-1-5) 0;
        border-bottom: 1px solid var(--mj-border-subtle);

        &:last-child {
            border-bottom: none;
        }
    }

    .overlay-label {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-muted);
    }

    .overlay-value {
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-medium);
        color: var(--mj-text-primary);
    }

    .status-active {
        color: var(--mj-status-success-text);
    }

    .overlay-actions {
        min-width: 160px;

        button {
            justify-content: flex-start;
        }
    }

    /* Sidebar content */
    .sidebar-content {
    }

    .sidebar-text {
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        line-height: var(--mj-leading-relaxed);
        margin: 0;
    }

    .sidebar-nav-list {
    }

    .sidebar-nav-item {
        padding: var(--mj-space-2-5) var(--mj-space-3);
        border-radius: var(--mj-radius-md);
        cursor: pointer;
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        transition: all var(--mj-transition-base);

        &:hover {
            background-color: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }

        i {
            width: 20px;
            text-align: center;
            font-size: var(--mj-text-base);
        }
    }

    .sidebar-detail-card {
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-lg);
        padding: var(--mj-space-4);

        h4 {
            margin: 0 0 var(--mj-space-3) 0;
            font-size: var(--mj-text-base);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-primary);
        }
    }

    .sidebar-detail-row {
        padding: var(--mj-space-2) 0;
        border-bottom: 1px solid var(--mj-border-subtle);

        &:last-child {
            border-bottom: none;
        }
    }

    .sidebar-detail-label {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-muted);
    }

    .sidebar-detail-value {
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-medium);
        color: var(--mj-text-primary);
    }

    .sidebar-actions {
        padding-top: var(--mj-space-2);
    }

    /* Tooltip badges */
    .tooltip-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--mj-space-2);
        padding: var(--mj-space-2) var(--mj-space-4);
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
        cursor: default;
        transition: border-color var(--mj-transition-fast);

        &:hover {
            border-color: var(--mj-border-focus);
        }

        i {
            color: var(--mj-text-muted);
        }
    }

    .tooltip-help {
        color: var(--mj-text-secondary);
        border-style: dashed;

        i {
            color: var(--mj-brand-primary);
        }
    }

    /* DynamicDialog */
    .dynamic-dialog-note {
        display: flex;
        align-items: flex-start;
        gap: var(--mj-space-2);
        padding: var(--mj-space-3) var(--mj-space-4);
        background: color-mix(in srgb, var(--mj-status-info-bg) 60%, transparent);
        border: 1px solid var(--mj-status-info-text);
        border-radius: var(--mj-radius-md);
        font-size: var(--mj-text-sm);
        color: var(--mj-status-info-text);
        line-height: var(--mj-leading-relaxed);
        margin-top: var(--mj-space-2);

        i {
            font-size: var(--mj-text-base);
            margin-top: 2px;
            flex-shrink: 0;
        }
    }

    code {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent);
        padding: var(--mj-space-0-5) var(--mj-space-1-5);
        border-radius: var(--mj-radius-sm);
    }
    `]
})
export class OverlaysComponent {
    ShowDialog = false;
    ShowSidebarLeft = false;
    ShowSidebarRight = false;
    LastConfirmResult: string | null = null;
    LastPopupResult: string | null = null;

    private dialogService = inject(DialogService);

    constructor(private confirmationService: ConfirmationService) {}

    ConfirmDelete(event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Are you sure you want to delete this record? This action cannot be undone.',
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            acceptButtonStyleClass: 'p-button-danger',
            rejectButtonStyleClass: 'p-button-text',
            accept: () => {
                this.LastConfirmResult = 'Record deleted successfully.';
            },
            reject: () => {
                this.LastConfirmResult = 'Delete cancelled.';
            }
        });
    }

    ConfirmSave(event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to save the current changes?',
            header: 'Save Confirmation',
            icon: 'pi pi-save',
            acceptButtonStyleClass: 'p-button-primary',
            rejectButtonStyleClass: 'p-button-text',
            accept: () => {
                this.LastConfirmResult = 'Changes saved successfully.';
            },
            reject: () => {
                this.LastConfirmResult = 'Save cancelled.';
            }
        });
    }

    ConfirmPopup(event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Archive this item?',
            icon: 'pi pi-inbox',
            accept: () => {
                this.LastPopupResult = 'Item archived successfully.';
            },
            reject: () => {
                this.LastPopupResult = 'Archive cancelled.';
            }
        });
    }

    OpenDynamicDialog() {
        this.dialogService.open(DynamicDialogContentComponent, {
            header: 'Dynamic Dialog Demo',
            width: '420px',
            modal: true,
            data: {
                message: 'Hello from the style guide!'
            }
        });
    }
}
