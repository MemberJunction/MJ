import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-buttons',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatButtonToggleModule, MatIconModule],
    template: `
    <div class="buttons-page">
        <h2 class="page-heading">Buttons</h2>
        <p class="page-desc">
            Angular Material button variants, all themed via MJ design tokens bridged through
            <code>--mat-sys-*</code> overrides. Each section notes which tokens drive the styling.
        </p>

        <!-- =============================================
             1. BASIC / TEXT BUTTONS (mat-button)
             ============================================= -->
        <section class="token-section">
            <h3 class="section-title">Basic / Text Buttons</h3>
            <p class="subsection-desc">
                <code>mat-button</code> &mdash; text color maps to
                <code>--mj-brand-primary</code> via <code>--mat-sys-primary</code>
            </p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button mat-button>Default</button>
                <button mat-button color="primary">Primary</button>
                <button mat-button>
                    <mat-icon>bookmark</mat-icon>
                    With Icon
                </button>
                <button mat-button disabled>Disabled</button>
            </div>
        </section>

        <!-- =============================================
             2. RAISED BUTTONS (mat-raised-button)
             ============================================= -->
        <section class="token-section">
            <h3 class="section-title">Raised Buttons</h3>
            <p class="subsection-desc">
                <code>mat-raised-button</code> &mdash; bg maps to
                <code>--mj-brand-primary</code>, text to
                <code>--mj-brand-on-primary</code>
            </p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button mat-raised-button>Default</button>
                <button mat-raised-button color="primary">Primary</button>
                <button mat-raised-button color="accent">Accent</button>
                <button mat-raised-button color="warn">Warn</button>
                <button mat-raised-button disabled>Disabled</button>
            </div>
        </section>

        <!-- =============================================
             3. FLAT BUTTONS (mat-flat-button)
             ============================================= -->
        <section class="token-section">
            <h3 class="section-title">Flat Buttons</h3>
            <p class="subsection-desc">
                <code>mat-flat-button</code> &mdash; bg maps to
                <code>--mat-sys-primary</code> / secondary / error per color attribute
            </p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button mat-flat-button>Default</button>
                <button mat-flat-button color="primary">Primary</button>
                <button mat-flat-button color="accent">Accent</button>
                <button mat-flat-button color="warn">Warn</button>
                <button mat-flat-button disabled>Disabled</button>
            </div>
        </section>

        <!-- =============================================
             4. STROKED / OUTLINED BUTTONS (mat-stroked-button)
             ============================================= -->
        <section class="token-section">
            <h3 class="section-title">Stroked / Outlined Buttons</h3>
            <p class="subsection-desc">
                <code>mat-stroked-button</code> &mdash; border maps to
                <code>--mat-sys-outline</code> (<code>--mj-border-default</code>)
            </p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button mat-stroked-button>Default</button>
                <button mat-stroked-button color="primary">Primary</button>
                <button mat-stroked-button color="accent">Accent</button>
                <button mat-stroked-button color="warn">Warn</button>
                <button mat-stroked-button disabled>Disabled</button>
            </div>
        </section>

        <!-- =============================================
             5. ICON BUTTONS (mat-icon-button)
             ============================================= -->
        <section class="token-section">
            <h3 class="section-title">Icon Buttons</h3>
            <p class="subsection-desc">
                <code>mat-icon-button</code> &mdash; color maps to
                <code>--mat-sys-on-surface</code> (<code>--mj-text-primary</code>)
            </p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button mat-icon-button aria-label="Edit">
                    <mat-icon>edit</mat-icon>
                </button>
                <button mat-icon-button color="primary" aria-label="Delete">
                    <mat-icon>delete</mat-icon>
                </button>
                <button mat-icon-button aria-label="Search">
                    <mat-icon>search</mat-icon>
                </button>
                <button mat-icon-button aria-label="Settings">
                    <mat-icon>settings</mat-icon>
                </button>
                <button mat-icon-button color="warn" aria-label="Favorite">
                    <mat-icon>favorite</mat-icon>
                </button>
                <button mat-icon-button disabled aria-label="Disabled">
                    <mat-icon>block</mat-icon>
                </button>
            </div>

            <h4 class="subsection-title">Outlined Icon Buttons (custom)</h4>
            <p class="subsection-desc">
                Icon buttons with an outline border for secondary emphasis
            </p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button mat-icon-button class="icon-btn-outlined" aria-label="Add">
                    <mat-icon>add</mat-icon>
                </button>
                <button mat-icon-button class="icon-btn-outlined" aria-label="Refresh">
                    <mat-icon>refresh</mat-icon>
                </button>
                <button mat-icon-button class="icon-btn-outlined" aria-label="More">
                    <mat-icon>more_vert</mat-icon>
                </button>
            </div>
        </section>

        <!-- =============================================
             6. FAB (Floating Action Button)
             ============================================= -->
        <section class="token-section">
            <h3 class="section-title">Floating Action Buttons (FAB)</h3>
            <p class="subsection-desc">
                <code>mat-fab</code> / <code>mat-mini-fab</code> &mdash; bg maps to
                <code>--mat-sys-primary-container</code> (<code>--mj-color-brand-100</code>)
            </p>

            <h4 class="subsection-title">Standard FAB</h4>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button mat-fab>
                    <mat-icon>add</mat-icon>
                </button>
                <button mat-fab color="primary">
                    <mat-icon>edit</mat-icon>
                </button>
                <button mat-fab color="accent">
                    <mat-icon>star</mat-icon>
                </button>
                <button mat-fab color="warn">
                    <mat-icon>delete</mat-icon>
                </button>
            </div>

            <h4 class="subsection-title">Mini FAB</h4>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button mat-mini-fab>
                    <mat-icon>add</mat-icon>
                </button>
                <button mat-mini-fab color="primary">
                    <mat-icon>edit</mat-icon>
                </button>
                <button mat-mini-fab color="accent">
                    <mat-icon>navigation</mat-icon>
                </button>
                <button mat-mini-fab color="warn">
                    <mat-icon>warning</mat-icon>
                </button>
            </div>

            <h4 class="subsection-title">Extended FAB</h4>
            <p class="subsection-desc">
                Extended FAB with icon + label for primary page actions
            </p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button mat-fab extended>
                    <mat-icon>add</mat-icon>
                    Create New
                </button>
                <button mat-fab extended color="primary">
                    <mat-icon>upload</mat-icon>
                    Upload File
                </button>
                <button mat-fab extended color="accent">
                    <mat-icon>chat</mat-icon>
                    Start Chat
                </button>
            </div>
        </section>

        <!-- =============================================
             7. BUTTON TOGGLE GROUP
             ============================================= -->
        <section class="token-section">
            <h3 class="section-title">Button Toggle Groups</h3>
            <p class="subsection-desc">
                <code>mat-button-toggle-group</code> &mdash; selected state maps to
                <code>--mat-sys-secondary-container</code> (<code>--mj-color-accent-100</code>)
            </p>

            <h4 class="subsection-title">Single Selection (Alignment)</h4>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <mat-button-toggle-group [value]="SelectedAlignment">
                    @for (option of AlignmentOptions; track option.value) {
                        <mat-button-toggle [value]="option.value">
                            <mat-icon>{{ option.icon }}</mat-icon>
                        </mat-button-toggle>
                    }
                </mat-button-toggle-group>
            </div>

            <h4 class="subsection-title">Multiple Selection (Text Formatting)</h4>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <mat-button-toggle-group multiple>
                    @for (option of FormattingOptions; track option.value) {
                        <mat-button-toggle [value]="option.value">
                            <mat-icon>{{ option.icon }}</mat-icon>
                        </mat-button-toggle>
                    }
                </mat-button-toggle-group>
            </div>

            <h4 class="subsection-title">Text Labels with Appearance</h4>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <mat-button-toggle-group appearance="standard" [value]="SelectedView">
                    @for (view of ViewOptions; track view) {
                        <mat-button-toggle [value]="view">{{ view }}</mat-button-toggle>
                    }
                </mat-button-toggle-group>
            </div>
        </section>

        <!-- =============================================
             8. BUTTON SIZES (custom CSS)
             ============================================= -->
        <section class="token-section">
            <h3 class="section-title">Button Sizes</h3>
            <p class="subsection-desc">
                Custom sizing via CSS overrides using MJ spacing tokens. Angular Material
                does not ship size variants, so we provide <code>.btn-sm</code>,
                <code>.btn-md</code>, <code>.btn-lg</code> utility classes.
            </p>

            <h4 class="subsection-title">Flat Button Sizes</h4>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button mat-flat-button color="primary" class="btn-sm">Small</button>
                <button mat-flat-button color="primary" class="btn-md">Medium (default)</button>
                <button mat-flat-button color="primary" class="btn-lg">Large</button>
            </div>

            <h4 class="subsection-title">Stroked Button Sizes</h4>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button mat-stroked-button color="primary" class="btn-sm">Small</button>
                <button mat-stroked-button color="primary" class="btn-md">Medium</button>
                <button mat-stroked-button color="primary" class="btn-lg">Large</button>
            </div>

            <h4 class="subsection-title">Full-Width Button</h4>
            <div class="component-row mj-grid mj-gap-3 mj-align-center mj-flex-column">
                <button mat-flat-button color="primary" class="btn-full-width">
                    Full Width Action
                </button>
            </div>
        </section>

        <!-- =============================================
             9. BUTTON STATES
             ============================================= -->
        <section class="token-section">
            <h3 class="section-title">Button States</h3>
            <p class="subsection-desc">
                Visual reference for interactive states. Hover and focus states are driven
                by Material's ripple and state layers, themed via <code>--mat-sys-*</code> tokens.
            </p>

            <div class="states-grid mj-row mj-row-cols-2 mj-row-cols-sm-3 mj-row-cols-md-4 mj-row-cols-lg-6 mj-gap-4">
                @for (state of ButtonStates; track state.label) {
                    <div class="mj-grid mj-flex-column mj-align-center mj-gap-2">
                        <span class="state-label">{{ state.label }}</span>
                        <button mat-flat-button color="primary"
                            [disabled]="state.disabled"
                            [class.active-demo]="state.active">
                            {{ state.label }}
                        </button>
                    </div>
                }
            </div>
        </section>

        <!-- =============================================
             10. TOKEN REFERENCE TABLE
             ============================================= -->
        <section class="token-section">
            <h3 class="section-title">Token Reference</h3>
            <p class="subsection-desc">
                Summary of design token mappings for button components.
            </p>
            <div class="token-table-wrapper">
                <table class="token-table">
                    <thead>
                        <tr>
                            <th>Variant</th>
                            <th>Property</th>
                            <th>Material Token</th>
                            <th>MJ Token</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (row of TokenRows; track row.variant + row.property) {
                            <tr>
                                <td><code>{{ row.variant }}</code></td>
                                <td>{{ row.property }}</td>
                                <td><code>{{ row.matToken }}</code></td>
                                <td><code>{{ row.mjToken }}</code></td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        </section>
    </div>
    `,
    styles: [`
        .buttons-page {
            max-width: 900px;
        }

        .page-heading {
            margin: 0 0 var(--mj-space-2) 0;
            font-size: var(--mj-text-3xl);
            font-weight: var(--mj-font-bold);
            color: var(--mj-text-primary);
        }

        .page-desc {
            margin: 0 0 var(--mj-space-8) 0;
            font-size: var(--mj-text-base);
            color: var(--mj-text-secondary);
            line-height: var(--mj-leading-relaxed);

            code {
                font-family: var(--mj-font-family-mono);
                font-size: var(--mj-text-sm);
                background-color: var(--mj-bg-surface-sunken);
                padding: var(--mj-space-0-5) var(--mj-space-1-5);
                border-radius: var(--mj-radius-sm);
                color: var(--mj-brand-primary);
            }
        }

        /* ======================================
           SECTIONS
           ====================================== */

        .token-section {
            margin-bottom: var(--mj-space-10);
            padding-bottom: var(--mj-space-8);
            border-bottom: 1px solid var(--mj-border-subtle);

            &:last-child {
                border-bottom: none;
            }
        }

        .section-title {
            margin: 0 0 var(--mj-space-2) 0;
            font-size: var(--mj-text-xl);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-primary);
        }

        .subsection-title {
            margin: var(--mj-space-5) 0 var(--mj-space-2) 0;
            font-size: var(--mj-text-base);
            font-weight: var(--mj-font-medium);
            color: var(--mj-text-primary);
        }

        .subsection-desc {
            margin: 0 0 var(--mj-space-4) 0;
            font-size: var(--mj-text-sm);
            color: var(--mj-text-muted);
            line-height: var(--mj-leading-normal);

            code {
                font-family: var(--mj-font-family-mono);
                font-size: var(--mj-text-xs);
                background-color: var(--mj-bg-surface-sunken);
                padding: var(--mj-space-0-5) var(--mj-space-1);
                border-radius: var(--mj-radius-sm);
                color: var(--mj-brand-primary);
            }
        }

        /* ======================================
           COMPONENT ROWS
           ====================================== */

        .component-row {
            padding: var(--mj-space-4);
            background-color: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-subtle);
            border-radius: var(--mj-radius-lg);
        }

        /* ======================================
           BUTTON SIZES (custom utilities)
           ====================================== */

        .btn-sm {
            --mdc-text-button-container-height: 32px;
            --mdc-filled-button-container-height: 32px;
            --mdc-outlined-button-container-height: 32px;
            --mdc-protected-button-container-height: 32px;
            font-size: var(--mj-text-xs) !important;
            padding: 0 var(--mj-space-3) !important;
        }

        .btn-md {
            --mdc-text-button-container-height: 40px;
            --mdc-filled-button-container-height: 40px;
            --mdc-outlined-button-container-height: 40px;
            --mdc-protected-button-container-height: 40px;
            font-size: var(--mj-text-sm) !important;
            padding: 0 var(--mj-space-5) !important;
        }

        .btn-lg {
            --mdc-text-button-container-height: 52px;
            --mdc-filled-button-container-height: 52px;
            --mdc-outlined-button-container-height: 52px;
            --mdc-protected-button-container-height: 52px;
            font-size: var(--mj-text-lg) !important;
            padding: 0 var(--mj-space-8) !important;
        }

        .btn-full-width {
            width: 100%;
        }

        /* ======================================
           OUTLINED ICON BUTTONS (custom)
           ====================================== */

        .icon-btn-outlined {
            border: 1px solid var(--mj-border-default) !important;
            border-radius: var(--mj-radius-md) !important;

            &:hover {
                border-color: var(--mj-border-strong) !important;
                background-color: var(--mj-bg-surface-hover) !important;
            }
        }

        /* ======================================
           STATES GRID
           ====================================== */

        .states-grid {
            padding: var(--mj-space-4);
            background-color: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-subtle);
            border-radius: var(--mj-radius-lg);
        }

        .state-label {
            font-size: var(--mj-text-xs);
            font-weight: var(--mj-font-medium);
            color: var(--mj-text-muted);
            text-transform: uppercase;
            letter-spacing: var(--mj-tracking-wide);
        }

        .active-demo {
            box-shadow: var(--mj-focus-ring) !important;
        }

        /* ======================================
           TOKEN REFERENCE TABLE
           ====================================== */

        .token-table-wrapper {
            overflow-x: auto;
            border: 1px solid var(--mj-border-subtle);
            border-radius: var(--mj-radius-lg);
        }

        .token-table {
            width: 100%;
            border-collapse: collapse;
            font-size: var(--mj-text-sm);

            th, td {
                padding: var(--mj-space-3) var(--mj-space-4);
                text-align: left;
                border-bottom: 1px solid var(--mj-border-subtle);
            }

            th {
                background-color: var(--mj-bg-surface-sunken);
                font-weight: var(--mj-font-semibold);
                color: var(--mj-text-primary);
                white-space: nowrap;
            }

            td {
                color: var(--mj-text-secondary);
            }

            tbody tr:last-child td {
                border-bottom: none;
            }

            tbody tr:hover {
                background-color: var(--mj-bg-surface-hover);
            }

            code {
                font-family: var(--mj-font-family-mono);
                font-size: var(--mj-text-xs);
                background-color: var(--mj-bg-surface-sunken);
                padding: var(--mj-space-0-5) var(--mj-space-1);
                border-radius: var(--mj-radius-sm);
                color: var(--mj-brand-primary);
            }
        }
    `]
})
export class ButtonsComponent {
    SelectedAlignment = 'center';
    SelectedView = 'Grid';

    AlignmentOptions = [
        { value: 'left', icon: 'format_align_left' },
        { value: 'center', icon: 'format_align_center' },
        { value: 'right', icon: 'format_align_right' },
        { value: 'justify', icon: 'format_align_justify' }
    ];

    FormattingOptions = [
        { value: 'bold', icon: 'format_bold' },
        { value: 'italic', icon: 'format_italic' },
        { value: 'underline', icon: 'format_underlined' },
        { value: 'strikethrough', icon: 'format_strikethrough' }
    ];

    ViewOptions = ['Grid', 'List', 'Cards'];

    ButtonStates = [
        { label: 'Default', disabled: false, active: false },
        { label: 'Hover', disabled: false, active: false },
        { label: 'Focus', disabled: false, active: true },
        { label: 'Disabled', disabled: true, active: false }
    ];

    TokenRows = [
        {
            variant: 'mat-button',
            property: 'Text color',
            matToken: '--mat-sys-primary',
            mjToken: '--mj-brand-primary'
        },
        {
            variant: 'mat-raised-button',
            property: 'Background',
            matToken: '--mat-sys-primary',
            mjToken: '--mj-brand-primary'
        },
        {
            variant: 'mat-raised-button',
            property: 'Text color',
            matToken: '--mat-sys-on-primary',
            mjToken: '--mj-brand-on-primary'
        },
        {
            variant: 'mat-flat-button',
            property: 'Background',
            matToken: '--mat-sys-primary',
            mjToken: '--mj-brand-primary'
        },
        {
            variant: 'mat-stroked-button',
            property: 'Border',
            matToken: '--mat-sys-outline',
            mjToken: '--mj-border-default'
        },
        {
            variant: 'mat-icon-button',
            property: 'Icon color',
            matToken: '--mat-sys-on-surface',
            mjToken: '--mj-text-primary'
        },
        {
            variant: 'mat-fab',
            property: 'Background',
            matToken: '--mat-sys-primary-container',
            mjToken: '--mj-color-brand-100'
        },
        {
            variant: 'mat-fab',
            property: 'Icon color',
            matToken: '--mat-sys-on-primary-container',
            mjToken: '--mj-color-brand-900'
        },
        {
            variant: 'button-toggle (selected)',
            property: 'Background',
            matToken: '--mat-sys-secondary-container',
            mjToken: '--mj-color-accent-100'
        },
        {
            variant: 'button-toggle',
            property: 'Border',
            matToken: '--mat-sys-outline',
            mjToken: '--mj-border-default'
        }
    ];
}
