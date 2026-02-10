import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';

@Component({
    selector: 'app-indicators',
    standalone: true,
    imports: [
        CommonModule,
        MatProgressBarModule,
        MatProgressSpinnerModule,
        MatChipsModule,
        MatIconModule,
        MatBadgeModule
    ],
    template: `
    <div class="indicators-page">

        <!-- Progress Bar -->
        <section class="demo-section">
            <h2>Progress Bar</h2>
            <p class="section-desc">Linear progress indicators show operation progress. Indicator color maps to --mj-brand-primary.</p>

            <div class="mj-grid mj-flex-column mj-gap-4">
                <div class="progress-item mj-grid mj-flex-column mj-gap-2">
                    <span class="progress-label">Determinate ({{ progressValue }}%)</span>
                    <mat-progress-bar mode="determinate" [value]="progressValue"></mat-progress-bar>
                </div>
                <div class="progress-item mj-grid mj-flex-column mj-gap-2">
                    <span class="progress-label">Indeterminate</span>
                    <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                </div>
                <div class="progress-item mj-grid mj-flex-column mj-gap-2">
                    <span class="progress-label">Buffer</span>
                    <mat-progress-bar mode="buffer" [value]="progressValue" [bufferValue]="bufferValue"></mat-progress-bar>
                </div>
                <div class="progress-item mj-grid mj-flex-column mj-gap-2">
                    <span class="progress-label">Query</span>
                    <mat-progress-bar mode="query"></mat-progress-bar>
                </div>
            </div>
            <div class="token-map">
                <code>indicator -> --mj-brand-primary</code>
            </div>
        </section>

        <!-- Progress Spinner -->
        <section class="demo-section">
            <h2>Progress Spinner</h2>
            <p class="section-desc">Circular progress indicators for loading states. Indicator color maps to --mj-brand-primary.</p>

            <h4>Determinate ({{ spinnerValue }}%)</h4>
            <div class="demo-row mj-grid mj-gap-4 mj-align-center">
                <mat-progress-spinner mode="determinate" [value]="spinnerValue" [diameter]="40"></mat-progress-spinner>
                <mat-progress-spinner mode="determinate" [value]="spinnerValue" [diameter]="60"></mat-progress-spinner>
                <mat-progress-spinner mode="determinate" [value]="spinnerValue" [diameter]="80"></mat-progress-spinner>
            </div>

            <h4>Indeterminate</h4>
            <div class="demo-row mj-grid mj-gap-4 mj-align-center">
                <mat-progress-spinner mode="indeterminate" [diameter]="40"></mat-progress-spinner>
                <mat-progress-spinner mode="indeterminate" [diameter]="60"></mat-progress-spinner>
                <mat-progress-spinner mode="indeterminate" [diameter]="80"></mat-progress-spinner>
            </div>
            <div class="token-map">
                <code>indicator -> --mj-brand-primary</code>
            </div>
        </section>

        <!-- Chips -->
        <section class="demo-section">
            <h2>Chips</h2>
            <p class="section-desc">Chips represent attributes, actions, or filters. Background maps to --mj-bg-surface-sunken.</p>

            <h4>Basic Display Chips</h4>
            <mat-chip-set>
                @for (chip of displayChips; track chip) {
                    <mat-chip>{{ chip }}</mat-chip>
                }
            </mat-chip-set>

            <h4>Chips with Icons</h4>
            <mat-chip-set>
                <mat-chip>
                    <mat-icon matChipAvatar>code</mat-icon>
                    Angular
                </mat-chip>
                <mat-chip>
                    <mat-icon matChipAvatar>palette</mat-icon>
                    Material
                </mat-chip>
                <mat-chip>
                    <mat-icon matChipAvatar>javascript</mat-icon>
                    TypeScript
                </mat-chip>
                <mat-chip>
                    <mat-icon matChipAvatar>css</mat-icon>
                    SCSS
                </mat-chip>
            </mat-chip-set>

            <h4>Removable Chips</h4>
            <mat-chip-set>
                @for (chip of removableChips; track chip) {
                    <mat-chip (removed)="RemoveChip(chip)">
                        {{ chip }}
                        <button matChipRemove>
                            <mat-icon>cancel</mat-icon>
                        </button>
                    </mat-chip>
                }
            </mat-chip-set>

            <h4>Highlighted / Selected Chips</h4>
            <mat-chip-set>
                <mat-chip highlighted>Primary</mat-chip>
                <mat-chip>Default</mat-chip>
                <mat-chip highlighted>Highlighted</mat-chip>
                <mat-chip>Default</mat-chip>
            </mat-chip-set>

            <div class="token-map">
                <code>bg -> --mj-bg-surface-sunken</code>
            </div>
        </section>

        <!-- Icons -->
        <section class="demo-section">
            <h2>Icons</h2>
            <p class="section-desc">Material Symbols provide a consistent visual language. Colors map to MJ brand and status tokens.</p>

            <h4>Standard Icons</h4>
            <div class="mj-row mj-row-cols-3 mj-row-cols-sm-4 mj-row-cols-md-6 mj-gap-3">
                @for (icon of iconList; track icon.name) {
                    <div class="icon-card mj-grid mj-flex-column mj-align-center mj-gap-2">
                        <mat-icon>{{ icon.name }}</mat-icon>
                        <span class="icon-name">{{ icon.name }}</span>
                    </div>
                }
            </div>

            <h4>Colored Icons (Brand &amp; Status Tokens)</h4>
            <div class="mj-row mj-row-cols-3 mj-row-cols-sm-4 mj-row-cols-md-6 mj-gap-3 colored">
                <div class="icon-card mj-grid mj-flex-column mj-align-center mj-gap-2">
                    <mat-icon class="icon-brand">home</mat-icon>
                    <span class="icon-name">brand-primary</span>
                </div>
                <div class="icon-card mj-grid mj-flex-column mj-align-center mj-gap-2">
                    <mat-icon class="icon-accent">star</mat-icon>
                    <span class="icon-name">accent</span>
                </div>
                <div class="icon-card mj-grid mj-flex-column mj-align-center mj-gap-2">
                    <mat-icon class="icon-success">check_circle</mat-icon>
                    <span class="icon-name">success</span>
                </div>
                <div class="icon-card mj-grid mj-flex-column mj-align-center mj-gap-2">
                    <mat-icon class="icon-warning">warning</mat-icon>
                    <span class="icon-name">warning</span>
                </div>
                <div class="icon-card mj-grid mj-flex-column mj-align-center mj-gap-2">
                    <mat-icon class="icon-error">error</mat-icon>
                    <span class="icon-name">error</span>
                </div>
                <div class="icon-card mj-grid mj-flex-column mj-align-center mj-gap-2">
                    <mat-icon class="icon-info">info</mat-icon>
                    <span class="icon-name">info</span>
                </div>
            </div>

            <h4>Icon Sizes</h4>
            <div class="demo-row size-demo mj-grid mj-flex-nowrap mj-gap-4 mj-align-end">
                <div class="size-item mj-grid mj-flex-column mj-align-center mj-gap-1">
                    <mat-icon class="icon-sm">settings</mat-icon>
                    <span>18px</span>
                </div>
                <div class="size-item mj-grid mj-flex-column mj-align-center mj-gap-1">
                    <mat-icon>settings</mat-icon>
                    <span>24px</span>
                </div>
                <div class="size-item mj-grid mj-flex-column mj-align-center mj-gap-1">
                    <mat-icon class="icon-lg">settings</mat-icon>
                    <span>36px</span>
                </div>
                <div class="size-item mj-grid mj-flex-column mj-align-center mj-gap-1">
                    <mat-icon class="icon-xl">settings</mat-icon>
                    <span>48px</span>
                </div>
            </div>
        </section>

    </div>
    `,
    styles: [`
    .indicators-page {
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

    /* Progress Bar */

    .progress-label {
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-medium);
        color: var(--mj-text-secondary);
    }

    /* Chips */
    mat-chip-set {
        margin-bottom: var(--mj-space-2);
    }

    /* Icons Grid */
    .icon-card {
        padding: var(--mj-space-4) var(--mj-space-2);
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        transition: all var(--mj-transition-base);

        &:hover {
            border-color: var(--mj-brand-primary);
            box-shadow: var(--mj-shadow-sm);
            transform: translateY(-2px);
        }

        mat-icon {
            font-size: 28px;
            width: 28px;
            height: 28px;
            color: var(--mj-text-primary);
        }
    }

    .icon-name {
        font-size: 10px;
        font-family: var(--mj-font-family-mono);
        color: var(--mj-text-muted);
        text-align: center;
        word-break: break-all;
    }

    /* Colored icons */
    .icon-brand { color: var(--mj-brand-primary) !important; }
    .icon-accent { color: var(--mj-color-accent-500) !important; }
    .icon-success { color: var(--mj-status-success-text) !important; }
    .icon-warning { color: var(--mj-status-warning-text) !important; }
    .icon-error { color: var(--mj-status-error-text) !important; }
    .icon-info { color: var(--mj-status-info-text) !important; }

    /* Icon sizes */
    .size-item {
        span {
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
            font-family: var(--mj-font-family-mono);
        }
    }

    .icon-sm {
        font-size: 18px !important;
        width: 18px !important;
        height: 18px !important;
    }

    .icon-lg {
        font-size: 36px !important;
        width: 36px !important;
        height: 36px !important;
    }

    .icon-xl {
        font-size: 48px !important;
        width: 48px !important;
        height: 48px !important;
    }
    `]
})
export class IndicatorsComponent {
    progressValue = 65;
    spinnerValue = 75;
    bufferValue = 75;

    displayChips = ['Angular', 'Material', 'TypeScript', 'SCSS'];
    removableChips = ['Design', 'Tokens', 'Dark Mode', 'Components'];

    iconList = [
        { name: 'home' },
        { name: 'settings' },
        { name: 'favorite' },
        { name: 'delete' },
        { name: 'search' },
        { name: 'notifications' },
        { name: 'account_circle' },
        { name: 'cloud' },
        { name: 'lock' },
        { name: 'star' }
    ];

    RemoveChip(chip: string) {
        const index = this.removableChips.indexOf(chip);
        if (index >= 0) {
            this.removableChips.splice(index, 1);
        }
    }
}
