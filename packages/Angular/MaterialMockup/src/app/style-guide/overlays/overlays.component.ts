import { Component, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatBottomSheetModule, MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-overlays',
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        MatBottomSheetModule,
        MatSnackBarModule,
        MatTooltipModule,
        MatButtonModule,
        MatIconModule
    ],
    template: `
    <div class="overlays-page">

        <!-- Dialog -->
        <section class="demo-section">
            <h2>Dialog</h2>
            <p class="section-desc">Modal dialogs focus user attention on a specific task or message. Background is --mj-bg-surface-elevated.</p>
            <div class="mj-grid mj-gap-3 mj-align-center demo-row">
                <button mat-flat-button color="primary" (click)="OpenDialog(dialogTemplate)">
                    <mat-icon>open_in_new</mat-icon>
                    Open Dialog
                </button>
            </div>
            <div class="token-map">
                <code>bg -> --mj-bg-surface-elevated</code>
            </div>
        </section>

        <ng-template #dialogTemplate>
            <div class="mj-dialog">
                <h2 mat-dialog-title>Confirm Action</h2>
                <mat-dialog-content>
                    <p>Are you sure you want to proceed with this action? This operation cannot be undone.</p>
                </mat-dialog-content>
                <mat-dialog-actions align="end">
                    <button mat-button mat-dialog-close>Cancel</button>
                    <button mat-flat-button color="primary" mat-dialog-close>Confirm</button>
                </mat-dialog-actions>
            </div>
        </ng-template>

        <!-- Bottom Sheet -->
        <section class="demo-section">
            <h2>Bottom Sheet</h2>
            <p class="section-desc">Bottom sheets slide up from the bottom to show contextual actions. Background is --mj-bg-surface-elevated.</p>
            <div class="mj-grid mj-gap-3 mj-align-center demo-row">
                <button mat-flat-button color="primary" (click)="OpenBottomSheet(bottomSheetTemplate)">
                    <mat-icon>vertical_align_bottom</mat-icon>
                    Open Bottom Sheet
                </button>
            </div>
            <div class="token-map">
                <code>bg -> --mj-bg-surface-elevated</code>
            </div>
        </section>

        <ng-template #bottomSheetTemplate>
            <div class="mj-bottom-sheet">
                <h3>Quick Actions</h3>
                <nav class="mj-grid mj-flex-column">
                    <button mat-button class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center sheet-action" (click)="bottomSheet.dismiss()">
                        <mat-icon>share</mat-icon>
                        <span>Share</span>
                    </button>
                    <button mat-button class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center sheet-action" (click)="bottomSheet.dismiss()">
                        <mat-icon>link</mat-icon>
                        <span>Copy Link</span>
                    </button>
                    <button mat-button class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center sheet-action" (click)="bottomSheet.dismiss()">
                        <mat-icon>edit</mat-icon>
                        <span>Edit</span>
                    </button>
                    <button mat-button class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center sheet-action" (click)="bottomSheet.dismiss()">
                        <mat-icon>delete</mat-icon>
                        <span>Delete</span>
                    </button>
                    <button mat-button class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center sheet-action" (click)="bottomSheet.dismiss()">
                        <mat-icon>download</mat-icon>
                        <span>Download</span>
                    </button>
                </nav>
            </div>
        </ng-template>

        <!-- Snackbar -->
        <section class="demo-section">
            <h2>Snackbar</h2>
            <p class="section-desc">Snackbars provide brief notifications at the bottom of the screen. Background is --mj-color-neutral-800.</p>
            <div class="mj-grid mj-gap-3 mj-align-center demo-row">
                <button mat-flat-button color="primary" (click)="ShowSnackbar('Item saved successfully')">
                    <mat-icon>check_circle</mat-icon>
                    Basic Snackbar
                </button>
                <button mat-stroked-button (click)="ShowSnackbar('Message archived', 'Undo')">
                    <mat-icon>undo</mat-icon>
                    Snackbar with Action
                </button>
            </div>
            <div class="token-map">
                <code>bg -> --mj-color-neutral-800</code>
            </div>
        </section>

        <!-- Tooltip -->
        <section class="demo-section">
            <h2>Tooltip</h2>
            <p class="section-desc">Tooltips display informative text on hover or focus. Background is --mj-color-neutral-800.</p>

            <h4>Position Variants</h4>
            <div class="mj-grid mj-gap-3 mj-align-center demo-row">
                <button mat-stroked-button matTooltip="Tooltip above" matTooltipPosition="above">
                    Above
                </button>
                <button mat-stroked-button matTooltip="Tooltip below" matTooltipPosition="below">
                    Below
                </button>
                <button mat-stroked-button matTooltip="Tooltip left" matTooltipPosition="left">
                    Left
                </button>
                <button mat-stroked-button matTooltip="Tooltip right" matTooltipPosition="right">
                    Right
                </button>
            </div>

            <h4>Icon Buttons with Tooltips</h4>
            <div class="mj-grid mj-gap-3 mj-align-center demo-row">
                <button mat-icon-button matTooltip="Home" matTooltipPosition="above">
                    <mat-icon>home</mat-icon>
                </button>
                <button mat-icon-button matTooltip="Settings" matTooltipPosition="above">
                    <mat-icon>settings</mat-icon>
                </button>
                <button mat-icon-button matTooltip="Notifications" matTooltipPosition="above">
                    <mat-icon>notifications</mat-icon>
                </button>
                <button mat-icon-button matTooltip="Favorites" matTooltipPosition="above">
                    <mat-icon>favorite</mat-icon>
                </button>
                <button mat-icon-button matTooltip="Delete item" matTooltipPosition="above">
                    <mat-icon>delete</mat-icon>
                </button>
                <button mat-icon-button matTooltip="Search" matTooltipPosition="above">
                    <mat-icon>search</mat-icon>
                </button>
            </div>
            <div class="token-map">
                <code>bg -> --mj-color-neutral-800</code>
            </div>
        </section>

    </div>
    `,
    styles: [`
    .overlays-page {
        max-width: 900px;
    }

    .demo-section {
        margin-bottom: var(--mj-space-10);
    }

    .demo-section h2 {
        font-size: var(--mj-text-2xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-primary);
        margin: 0 0 var(--mj-space-2) 0;
    }

    .demo-section h4 {
        font-size: var(--mj-text-base);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
        margin: var(--mj-space-5) 0 var(--mj-space-3) 0;
    }

    .section-desc {
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        margin: 0 0 var(--mj-space-5) 0;
        line-height: var(--mj-leading-relaxed);
    }

    .demo-row {
        margin-bottom: var(--mj-space-4);
    }

    .token-map {
        margin-top: var(--mj-space-3);
        padding: var(--mj-space-2) var(--mj-space-3);
        background: var(--mj-bg-surface-sunken);
        border-radius: var(--mj-radius-md);
        display: inline-block;

        code {
            font-family: var(--mj-font-family-mono);
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }
    }

    /* Dialog styling */
    .mj-dialog {
        padding: var(--mj-space-2);

        h2 {
            font-size: var(--mj-text-xl);
            font-weight: var(--mj-font-bold);
            color: var(--mj-text-primary);
        }

        p {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
            line-height: var(--mj-leading-relaxed);
        }
    }

    /* Bottom sheet styling */
    .mj-bottom-sheet {
        padding: var(--mj-space-4) var(--mj-space-2);

        h3 {
            font-size: var(--mj-text-lg);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-primary);
            margin: 0 0 var(--mj-space-3) var(--mj-space-3);
        }
    }

    .sheet-action {
        justify-content: flex-start;
        width: 100%;
        padding: var(--mj-space-3) var(--mj-space-4);
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
        border-radius: var(--mj-radius-md);
        transition: background-color var(--mj-transition-fast);

        &:hover {
            background-color: var(--mj-bg-surface-hover);
        }

        mat-icon {
            color: var(--mj-text-secondary);
        }
    }
    `]
})
export class OverlaysComponent {
    constructor(
        private dialog: MatDialog,
        protected bottomSheet: MatBottomSheet,
        private snackBar: MatSnackBar
    ) {}

    OpenDialog(template: TemplateRef<unknown>) {
        this.dialog.open(template, { width: '480px' });
    }

    OpenBottomSheet(template: TemplateRef<unknown>) {
        this.bottomSheet.open(template);
    }

    ShowSnackbar(message: string, action?: string) {
        this.snackBar.open(message, action, { duration: 3000 });
    }
}
