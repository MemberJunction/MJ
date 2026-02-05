import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccordionModule } from 'primeng/accordion';
import { TabViewModule } from 'primeng/tabview';
import { FieldsetModule } from 'primeng/fieldset';
import { ToolbarModule } from 'primeng/toolbar';
import { SplitterModule } from 'primeng/splitter';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { DividerModule } from 'primeng/divider';
import { StepperModule } from 'primeng/stepper';
import { ButtonModule } from 'primeng/button';

@Component({
    selector: 'app-panels',
    standalone: true,
    imports: [
        CommonModule,
        AccordionModule,
        TabViewModule,
        FieldsetModule,
        ToolbarModule,
        SplitterModule,
        ScrollPanelModule,
        DividerModule,
        StepperModule,
        ButtonModule
    ],
    template: `
    <div class="panels-page">
        <!-- Accordion Section -->
        <section class="token-section">
            <h2>Accordion</h2>
            <p class="section-desc">Expandable content panels that allow users to show and hide sections of related content. Uses MJ surface and border tokens for consistent styling.</p>
            <p class="token-mapping">Header bg: --mj-bg-surface | Active: --mj-brand-primary | Border: --mj-border-default</p>

            <p-accordion [multiple]="true" [activeIndex]="[0]">
                <p-accordionTab header="Account Information">
                    <p>Manage your account details including name, email address, and profile picture.
                    All changes are saved automatically and synced across your devices.</p>
                    <p>Last updated: February 3, 2026</p>
                </p-accordionTab>
                <p-accordionTab header="Security Settings">
                    <p>Configure two-factor authentication, manage active sessions, and review
                    recent login activity. We recommend enabling 2FA for enhanced account security.</p>
                    <ul class="demo-list">
                        <li>Two-factor authentication: Enabled</li>
                        <li>Active sessions: 3 devices</li>
                        <li>Last password change: 14 days ago</li>
                    </ul>
                </p-accordionTab>
                <p-accordionTab header="Notification Preferences">
                    <p>Customize which notifications you receive and how they are delivered.
                    Choose between email, push notifications, or in-app alerts for each category.</p>
                </p-accordionTab>
            </p-accordion>
        </section>

        <!-- TabView Section -->
        <section class="token-section">
            <h2>TabView</h2>
            <p class="section-desc">Tabbed navigation for organizing content into separate views. Active tab uses brand primary color for the indicator.</p>
            <p class="token-mapping">Active tab: --mj-brand-primary | Inactive: --mj-text-secondary | Content bg: --mj-bg-surface</p>

            <p-tabView>
                <p-tabPanel header="Overview">
                    <div class="tab-content">
                        <h3 class="subsection-title">Project Overview</h3>
                        <p>This project is currently in the development phase with 12 active contributors.
                        The sprint deadline is set for February 15, 2026. All milestones are on track.</p>
                        <div class="stat-row mj-grid mj-gap-6">
                            <div class="mj-grid mj-flex-column mj-gap-1">
                                <span class="stat-value">87%</span>
                                <span class="stat-label">Complete</span>
                            </div>
                            <div class="mj-grid mj-flex-column mj-gap-1">
                                <span class="stat-value">24</span>
                                <span class="stat-label">Open Tasks</span>
                            </div>
                            <div class="mj-grid mj-flex-column mj-gap-1">
                                <span class="stat-value">3</span>
                                <span class="stat-label">Blockers</span>
                            </div>
                        </div>
                    </div>
                </p-tabPanel>
                <p-tabPanel header="Details">
                    <div class="tab-content">
                        <h3 class="subsection-title">Technical Details</h3>
                        <p>Built with Angular 18 and PrimeNG v17. The application uses a modular architecture
                        with lazy-loaded routes for optimal performance. Design tokens ensure visual consistency
                        across all components.</p>
                        <p><strong>Stack:</strong> Angular, PrimeNG, TypeScript, SCSS</p>
                        <p><strong>Repository:</strong> github.com/memberjunction/mj</p>
                    </div>
                </p-tabPanel>
                <p-tabPanel header="Settings">
                    <div class="tab-content">
                        <h3 class="subsection-title">Configuration</h3>
                        <p>Adjust build settings, environment variables, and deployment targets from this panel.
                        Changes take effect on the next build cycle.</p>
                        <ul class="demo-list">
                            <li>Build mode: Production</li>
                            <li>Source maps: Disabled</li>
                            <li>AOT compilation: Enabled</li>
                        </ul>
                    </div>
                </p-tabPanel>
            </p-tabView>
        </section>

        <!-- Fieldset Section -->
        <section class="token-section">
            <h2>Fieldset</h2>
            <p class="section-desc">A grouping component with a legend, optionally toggleable. Great for organizing form sections or related information.</p>
            <p class="token-mapping">Legend: --mj-text-primary | Border: --mj-border-default | Toggle icon: --mj-brand-primary</p>

            <p-fieldset legend="Connection Details" [toggleable]="true">
                <div class="fieldset-content">
                    <p>Configure the connection parameters for the external data source.
                    These settings are used when synchronizing records.</p>
                    <div class="mj-row mj-row-cols-sm-2 mj-row-cols-md-3 mj-row-cols-lg-4 mj-gap-4">
                        <div class="mj-grid mj-flex-column mj-gap-1">
                            <span class="fieldset-label">Host</span>
                            <span class="fieldset-value">db.memberjunction.com</span>
                        </div>
                        <div class="mj-grid mj-flex-column mj-gap-1">
                            <span class="fieldset-label">Port</span>
                            <span class="fieldset-value">5432</span>
                        </div>
                        <div class="mj-grid mj-flex-column mj-gap-1">
                            <span class="fieldset-label">Database</span>
                            <span class="fieldset-value">mj_production</span>
                        </div>
                        <div class="mj-grid mj-flex-column mj-gap-1">
                            <span class="fieldset-label">SSL</span>
                            <span class="fieldset-value">Enabled</span>
                        </div>
                    </div>
                </div>
            </p-fieldset>
        </section>

        <!-- Toolbar Section -->
        <section class="token-section">
            <h2>Toolbar</h2>
            <p class="section-desc">A horizontal bar for grouping buttons and actions. Supports left, center, and right alignment zones.</p>
            <p class="token-mapping">Background: --mj-bg-surface | Border: --mj-border-default | Button colors: --mj-brand-primary</p>

            <p-toolbar>
                <div class="p-toolbar-group-start">
                    <button pButton icon="pi pi-plus" label="New" class="p-button-primary p-button-sm"></button>
                    <button pButton icon="pi pi-upload" label="Import" class="p-button-secondary p-button-sm"></button>
                    <button pButton icon="pi pi-download" label="Export" class="p-button-outlined p-button-sm"></button>
                </div>
                <div class="p-toolbar-group-end">
                    <button pButton icon="pi pi-search" class="p-button-text p-button-sm"></button>
                    <button pButton icon="pi pi-filter" class="p-button-text p-button-sm"></button>
                    <button pButton icon="pi pi-cog" class="p-button-text p-button-sm"></button>
                </div>
            </p-toolbar>
        </section>

        <!-- Splitter Section -->
        <section class="token-section">
            <h2>Splitter</h2>
            <p class="section-desc">A resizable split layout with draggable gutter. Content can be split horizontally or vertically into adjustable panels.</p>
            <p class="token-mapping">Gutter: --mj-bg-surface-sunken | Border: --mj-border-default | Panel bg: --mj-bg-surface</p>

            <p-splitter [style]="{'height': '220px'}" [panelSizes]="[40, 60]" styleClass="splitter-demo">
                <ng-template pTemplate>
                    <div class="splitter-panel">
                        <h4>Navigation Panel</h4>
                        <ul class="demo-list">
                            <li>Dashboard</li>
                            <li>Entities</li>
                            <li>Reports</li>
                            <li>Settings</li>
                        </ul>
                    </div>
                </ng-template>
                <ng-template pTemplate>
                    <div class="splitter-panel">
                        <h4>Content Panel</h4>
                        <p>This panel takes up the remaining space. Drag the gutter between panels
                        to resize them. The splitter maintains minimum sizes and respects the
                        configured panel size percentages.</p>
                        <p>Useful for master-detail layouts, side-by-side comparisons,
                        and adjustable workspace configurations.</p>
                    </div>
                </ng-template>
            </p-splitter>
        </section>

        <!-- ScrollPanel Section -->
        <section class="token-section">
            <h2>ScrollPanel</h2>
            <p class="section-desc">A custom scrollbar container with themed scrollbar appearance. Ideal for constraining content to a fixed height with a styled overflow.</p>
            <p class="token-mapping">Scrollbar track: --mj-bg-surface-sunken | Scrollbar thumb: --mj-border-strong | Content: --mj-bg-surface</p>

            <p-scrollPanel [style]="{width: '100%', height: '200px'}">
                <div class="scroll-content">
                    <h4>Scrollable Content Area</h4>
                    <p>This container has a fixed height of 200px with a custom-styled scrollbar.
                    The scrollbar appearance is controlled by MJ design tokens to ensure consistency
                    with the overall theme.</p>
                    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                    incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
                    exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
                    <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
                    fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa
                    qui officia deserunt mollit anim id est laborum.</p>
                    <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
                    laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi
                    architecto beatae vitae dicta sunt explicabo.</p>
                    <p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia
                    consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam
                    est, qui dolorem ipsum quia dolor sit amet.</p>
                    <p>At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium
                    voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati
                    cupiditate non provident.</p>
                </div>
            </p-scrollPanel>
        </section>

        <!-- Divider Section -->
        <section class="token-section">
            <h2>Divider</h2>
            <p class="section-desc">Visual separators for content sections. Supports horizontal and vertical orientations with optional text labels.</p>
            <p class="token-mapping">Line color: --mj-border-default | Text: --mj-text-muted</p>

            <div class="divider-demos">
                <h3 class="subsection-title">Horizontal Dividers</h3>
                <p>Content above the divider.</p>
                <p-divider></p-divider>
                <p>Default horizontal divider separating content blocks.</p>

                <p-divider align="center">
                    <span class="divider-text">OR</span>
                </p-divider>
                <p>Divider with centered text label.</p>

                <p-divider align="left">
                    <span class="divider-text">Section Break</span>
                </p-divider>
                <p>Divider with left-aligned text.</p>

                <p-divider align="right">
                    <span class="divider-text"><i class="pi pi-star"></i></span>
                </p-divider>
                <p>Divider with right-aligned icon.</p>

                <h3 class="subsection-title">Vertical Divider</h3>
                <div class="vertical-divider-demo mj-grid mj-flex-nowrap mj-gap-5 mj-align-center mj-justify-center">
                    <span>Left Content</span>
                    <p-divider layout="vertical"></p-divider>
                    <span>Center Content</span>
                    <p-divider layout="vertical"></p-divider>
                    <span>Right Content</span>
                </div>
            </div>
        </section>

        <!-- Stepper Section -->
        <section class="token-section">
            <h2>Stepper</h2>
            <p class="section-desc">A multi-step wizard component for guiding users through a sequential process. Active step uses brand primary for visual emphasis.</p>
            <p class="token-mapping">Active step: --mj-brand-primary | Inactive: --mj-text-muted | Completed: --mj-status-success</p>

            <p-stepper [activeStep]="activeStep">
                <p-stepperPanel header="Data Source">
                    <ng-template pTemplate="content" let-nextCallback="nextCallback">
                        <div class="stepper-content">
                            <h4>Step 1: Select Data Source</h4>
                            <p>Choose the data source you want to import from. Supported sources include
                            SQL Server, PostgreSQL, MySQL, and CSV files.</p>
                            <ul class="demo-list">
                                <li>SQL Server - Production database</li>
                                <li>PostgreSQL - Analytics warehouse</li>
                                <li>CSV Upload - Manual data import</li>
                            </ul>
                            <div class="stepper-actions mj-grid mj-gap-3">
                                <button pButton label="Next" icon="pi pi-arrow-right" iconPos="right"
                                    class="p-button-primary p-button-sm" (click)="nextCallback.emit()"></button>
                            </div>
                        </div>
                    </ng-template>
                </p-stepperPanel>
                <p-stepperPanel header="Mapping">
                    <ng-template pTemplate="content" let-prevCallback="prevCallback" let-nextCallback="nextCallback">
                        <div class="stepper-content">
                            <h4>Step 2: Configure Field Mapping</h4>
                            <p>Map source fields to destination entity fields. The system will attempt
                            to auto-match fields based on name similarity.</p>
                            <div class="mapping-preview">
                                <div class="mapping-row mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                                    <span class="mapping-source">source.first_name</span>
                                    <i class="pi pi-arrow-right mapping-arrow"></i>
                                    <span class="mapping-target">FirstName</span>
                                </div>
                                <div class="mapping-row mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                                    <span class="mapping-source">source.last_name</span>
                                    <i class="pi pi-arrow-right mapping-arrow"></i>
                                    <span class="mapping-target">LastName</span>
                                </div>
                                <div class="mapping-row mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                                    <span class="mapping-source">source.email</span>
                                    <i class="pi pi-arrow-right mapping-arrow"></i>
                                    <span class="mapping-target">Email</span>
                                </div>
                            </div>
                            <div class="stepper-actions mj-grid mj-gap-3">
                                <button pButton label="Back" icon="pi pi-arrow-left"
                                    class="p-button-secondary p-button-sm" (click)="prevCallback.emit()"></button>
                                <button pButton label="Next" icon="pi pi-arrow-right" iconPos="right"
                                    class="p-button-primary p-button-sm" (click)="nextCallback.emit()"></button>
                            </div>
                        </div>
                    </ng-template>
                </p-stepperPanel>
                <p-stepperPanel header="Review & Import">
                    <ng-template pTemplate="content" let-prevCallback="prevCallback">
                        <div class="stepper-content">
                            <h4>Step 3: Review and Import</h4>
                            <p>Review the import configuration below before proceeding. Once started,
                            the import process cannot be cancelled.</p>
                            <div class="review-summary">
                                <div class="review-item mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                                    <span class="review-label">Source:</span>
                                    <span class="review-value">SQL Server - Production</span>
                                </div>
                                <div class="review-item mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                                    <span class="review-label">Records:</span>
                                    <span class="review-value">2,847 rows</span>
                                </div>
                                <div class="review-item mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                                    <span class="review-label">Mapped Fields:</span>
                                    <span class="review-value">3 of 3</span>
                                </div>
                            </div>
                            <div class="stepper-actions mj-grid mj-gap-3">
                                <button pButton label="Back" icon="pi pi-arrow-left"
                                    class="p-button-secondary p-button-sm" (click)="prevCallback.emit()"></button>
                                <button pButton label="Start Import" icon="pi pi-check"
                                    class="p-button-success p-button-sm"></button>
                            </div>
                        </div>
                    </ng-template>
                </p-stepperPanel>
            </p-stepper>
        </section>
    </div>
  `,
    styles: [`
    .panels-page {
        max-width: 1100px;
    }

    .token-section {
        margin-bottom: var(--mj-space-10);
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
        margin: var(--mj-space-5) 0 var(--mj-space-3) 0;
    }

    /* Shared list style */
    .demo-list {
        list-style: none;
        padding: 0;
        margin: var(--mj-space-3) 0 0 0;

        li {
            padding: var(--mj-space-2) 0;
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
            border-bottom: 1px solid var(--mj-border-subtle);

            &:last-child {
                border-bottom: none;
            }
        }
    }

    /* TabView content */
    .tab-content {
        padding: var(--mj-space-2) 0;

        p {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
            line-height: var(--mj-leading-relaxed);
            margin: 0 0 var(--mj-space-3) 0;
        }
    }

    .stat-row {
        margin-top: var(--mj-space-4);
    }

    .stat-value {
        font-size: var(--mj-text-2xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-brand-primary);
    }

    .stat-label {
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--mj-tracking-wide);
    }

    /* Fieldset content */
    .fieldset-content {
        p {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
            line-height: var(--mj-leading-relaxed);
            margin: 0 0 var(--mj-space-4) 0;
        }
    }

    .fieldset-label {
        font-size: var(--mj-text-xs);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--mj-tracking-wide);
    }

    .fieldset-value {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
        font-weight: var(--mj-font-medium);
    }

    /* Splitter panels */
    .splitter-panel {
        padding: var(--mj-space-4);
        height: 100%;

        h4 {
            font-size: var(--mj-text-base);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-primary);
            margin: 0 0 var(--mj-space-3) 0;
        }

        p {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
            line-height: var(--mj-leading-relaxed);
            margin: 0 0 var(--mj-space-2) 0;
        }
    }

    /* ScrollPanel content */
    .scroll-content {
        padding: var(--mj-space-4);

        h4 {
            font-size: var(--mj-text-base);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-primary);
            margin: 0 0 var(--mj-space-3) 0;
        }

        p {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
            line-height: var(--mj-leading-relaxed);
            margin: 0 0 var(--mj-space-4) 0;
        }
    }

    /* Divider demos */
    .divider-demos {
        p {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
            margin: 0;
        }
    }

    .divider-text {
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-medium);
        color: var(--mj-text-muted);
    }

    .vertical-divider-demo {
        padding: var(--mj-space-4) 0;
        height: 60px;

        span {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-primary);
            font-weight: var(--mj-font-medium);
        }
    }

    /* Stepper content */
    .stepper-content {
        padding: var(--mj-space-4) var(--mj-space-2);

        h4 {
            font-size: var(--mj-text-base);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-primary);
            margin: 0 0 var(--mj-space-3) 0;
        }

        p {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
            line-height: var(--mj-leading-relaxed);
            margin: 0 0 var(--mj-space-3) 0;
        }
    }

    .stepper-actions {
        margin-top: var(--mj-space-5);
    }

    /* Mapping preview */
    .mapping-preview {
        background: var(--mj-bg-surface-sunken);
        border-radius: var(--mj-radius-md);
        padding: var(--mj-space-3);
        margin-top: var(--mj-space-3);
    }

    .mapping-row {
        padding: var(--mj-space-2) var(--mj-space-3);

        &:not(:last-child) {
            border-bottom: 1px solid var(--mj-border-subtle);
        }
    }

    .mapping-source {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-text-secondary);
        min-width: 140px;
    }

    .mapping-arrow {
        color: var(--mj-brand-primary);
        font-size: var(--mj-text-xs);
    }

    .mapping-target {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-brand-primary);
        font-weight: var(--mj-font-semibold);
    }

    /* Review summary */
    .review-summary {
        background: var(--mj-bg-surface-sunken);
        border-radius: var(--mj-radius-md);
        padding: var(--mj-space-4);
        margin-top: var(--mj-space-3);
    }

    .review-item {
        padding: var(--mj-space-2) 0;

        &:not(:last-child) {
            border-bottom: 1px solid var(--mj-border-subtle);
        }
    }

    .review-label {
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
        min-width: 120px;
    }

    .review-value {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
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
export class PanelsComponent {
    activeStep = 0;
}
