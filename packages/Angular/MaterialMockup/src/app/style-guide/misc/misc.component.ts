import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatRippleModule } from '@angular/material/core';
import { MatSortModule } from '@angular/material/sort';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CdkDragDrop, CdkDrag, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';

@Component({
    selector: 'app-misc',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatRippleModule,
        MatSortModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatFormFieldModule,
        MatInputModule,
        MatIconModule,
        MatButtonModule,
        CdkDrag,
        CdkDropList
    ],
    template: `
    <div class="misc-page">

        <!-- Ripple Effect -->
        <section class="demo-section">
            <h2>Ripple Effect</h2>
            <p class="section-desc">Material ripple feedback on interactive surfaces. Ripple color maps to --mj-brand-primary.</p>

            <div class="mj-row mj-row-cols-md-3 mj-gap-4">
                <div class="ripple-box mj-grid mj-align-center mj-justify-center primary-ripple" matRipple>
                    <span>Primary Ripple</span>
                    <span class="ripple-hint">Click me</span>
                </div>
                <div class="ripple-box mj-grid mj-align-center mj-justify-center accent-ripple" matRipple [matRippleColor]="'rgba(0, 172, 215, 0.25)'">
                    <span>Accent Ripple</span>
                    <span class="ripple-hint">Click me</span>
                </div>
                <div class="ripple-box mj-grid mj-align-center mj-justify-center custom-ripple" matRipple [matRippleColor]="'rgba(255, 152, 0, 0.3)'">
                    <span>Custom Ripple</span>
                    <span class="ripple-hint">Click me</span>
                </div>
            </div>
            <div class="token-map">
                <code>ripple -> --mj-brand-primary</code>
            </div>
        </section>

        <!-- Date Range Picker -->
        <section class="demo-section">
            <h2>Date Range Picker</h2>
            <p class="section-desc">Select a date range with start and end inputs. Selected range color maps to --mj-brand-primary.</p>

            <mat-form-field appearance="outline" class="date-range-field">
                <mat-label>Select date range</mat-label>
                <mat-date-range-input [rangePicker]="picker">
                    <input matStartDate placeholder="Start date" [(ngModel)]="startDate">
                    <input matEndDate placeholder="End date" [(ngModel)]="endDate">
                </mat-date-range-input>
                <mat-hint>MM/DD/YYYY - MM/DD/YYYY</mat-hint>
                <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
                <mat-date-range-picker #picker></mat-date-range-picker>
            </mat-form-field>

            @if (startDate && endDate) {
                <div class="mj-grid mj-flex-nowrap mj-gap-2 mj-align-center date-result">
                    <mat-icon>event</mat-icon>
                    <span>Selected: {{ startDate | date:'mediumDate' }} - {{ endDate | date:'mediumDate' }}</span>
                </div>
            }

            <div class="token-map">
                <code>selected -> --mj-brand-primary</code>
            </div>
        </section>

        <!-- Drag and Drop -->
        <section class="demo-section">
            <h2>Drag and Drop</h2>
            <p class="section-desc">Reorderable list using Angular CDK drag and drop. Placeholder color maps to --mj-bg-surface-hover.</p>

            <div class="drag-list" cdkDropList (cdkDropListDropped)="OnDrop($event)">
                @for (item of dragItems; track item; let i = $index) {
                    <div class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center drag-item" cdkDrag>
                        <div class="drag-handle">
                            <mat-icon>drag_indicator</mat-icon>
                        </div>
                        <span class="drag-index">{{ i + 1 }}</span>
                        <span class="drag-label">{{ item }}</span>
                        <mat-icon class="drag-icon">movie</mat-icon>
                    </div>
                }
            </div>

            <div class="token-map">
                <code>placeholder -> --mj-bg-surface-hover</code>
            </div>
        </section>

    </div>
    `,
    styles: [`
    .misc-page {
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

    .section-desc {
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        margin: 0 0 var(--mj-space-5) 0;
        line-height: var(--mj-leading-relaxed);
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

    /* Ripple */
    .ripple-box {
        height: 120px;
        border-radius: var(--mj-radius-lg);
        cursor: pointer;
        user-select: none;
        transition: all var(--mj-transition-base);
        border: 1px solid var(--mj-border-default);

        span {
            font-size: var(--mj-text-sm);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-primary);
            pointer-events: none;
        }

        .ripple-hint {
            font-size: var(--mj-text-xs);
            font-weight: var(--mj-font-normal);
            color: var(--mj-text-muted);
        }
    }

    .primary-ripple {
        background: color-mix(in srgb, var(--mj-brand-primary) 6%, var(--mj-bg-surface));
        border-color: color-mix(in srgb, var(--mj-brand-primary) 20%, transparent);

        &:hover {
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
        }
    }

    .accent-ripple {
        background: color-mix(in srgb, var(--mj-color-accent-500) 6%, var(--mj-bg-surface));
        border-color: color-mix(in srgb, var(--mj-color-accent-500) 20%, transparent);

        &:hover {
            background: color-mix(in srgb, var(--mj-color-accent-500) 12%, var(--mj-bg-surface));
        }
    }

    .custom-ripple {
        background: color-mix(in srgb, orange 6%, var(--mj-bg-surface));
        border-color: color-mix(in srgb, orange 20%, transparent);

        &:hover {
            background: color-mix(in srgb, orange 12%, var(--mj-bg-surface));
        }
    }

    /* Date Range Picker */
    .date-range-field {
        width: 100%;
        max-width: 400px;
    }

    .date-result {
        margin-top: var(--mj-space-3);
        padding: var(--mj-space-3) var(--mj-space-4);
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);

        mat-icon {
            color: var(--mj-brand-primary);
            font-size: 20px;
            width: 20px;
            height: 20px;
        }
    }

    /* Drag and Drop */
    .drag-list {
        max-width: 480px;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        overflow: hidden;
        background: var(--mj-bg-surface);
    }

    .drag-item {
        padding: var(--mj-space-3) var(--mj-space-4);
        border-bottom: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        cursor: grab;
        transition: background-color var(--mj-transition-fast);
        user-select: none;

        &:last-child {
            border-bottom: none;
        }

        &:hover {
            background: var(--mj-bg-surface-hover);
        }

        &:active {
            cursor: grabbing;
        }
    }

    .drag-handle {
        display: flex;
        align-items: center;
        color: var(--mj-text-muted);

        mat-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
        }
    }

    .drag-index {
        font-size: var(--mj-text-xs);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-muted);
        min-width: 20px;
        text-align: center;
    }

    .drag-label {
        flex: 1;
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-medium);
        color: var(--mj-text-primary);
    }

    .drag-icon {
        color: var(--mj-text-muted);
        font-size: 20px;
        width: 20px;
        height: 20px;
    }

    /* CDK drag styles */
    .cdk-drag-preview {
        box-shadow: var(--mj-shadow-lg);
        border-radius: var(--mj-radius-md);
        background: var(--mj-bg-surface-elevated);
    }

    .cdk-drag-placeholder {
        opacity: 0.4;
        background: var(--mj-bg-surface-hover);
    }

    .cdk-drag-animating {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }

    .drag-list.cdk-drop-list-dragging .drag-item:not(.cdk-drag-placeholder) {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    `]
})
export class MiscComponent {
    dragItems = ['Episode I', 'Episode II', 'Episode III', 'Episode IV', 'Episode V'];
    startDate: Date | null = null;
    endDate: Date | null = null;

    OnDrop(event: CdkDragDrop<string[]>) {
        moveItemInArray(this.dragItems, event.previousIndex, event.currentIndex);
    }
}
