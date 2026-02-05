import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatStepperModule } from '@angular/material/stepper';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';

@Component({
    selector: 'app-navigation',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatToolbarModule,
        MatTabsModule,
        MatStepperModule,
        MatMenuModule,
        MatSidenavModule,
        MatButtonModule,
        MatIconModule,
        MatListModule
    ],
    template: `
    <div class="navigation-page">

        <!-- ============ TOOLBAR ============ -->
        <section class="demo-section">
            <h2>Toolbar</h2>
            <p class="section-desc">
                Top app bars display navigation, actions, and titles.
                <code>bg &rarr; --mj-bg-surface</code>
            </p>

            <div class="demo-block">
                <h4>Basic Toolbar</h4>
                <mat-toolbar class="demo-toolbar">
                    <button mat-icon-button><mat-icon>menu</mat-icon></button>
                    <span class="toolbar-title">My Application</span>
                    <span class="toolbar-spacer"></span>
                    <button mat-icon-button><mat-icon>search</mat-icon></button>
                    <button mat-icon-button><mat-icon>notifications</mat-icon></button>
                    <button mat-icon-button><mat-icon>account_circle</mat-icon></button>
                </mat-toolbar>
            </div>

            <div class="demo-block">
                <h4>Multi-Row Toolbar</h4>
                <mat-toolbar class="demo-toolbar multi-row">
                    <mat-toolbar-row>
                        <button mat-icon-button><mat-icon>menu</mat-icon></button>
                        <span class="toolbar-title">Dashboard</span>
                        <span class="toolbar-spacer"></span>
                        <button mat-icon-button><mat-icon>more_vert</mat-icon></button>
                    </mat-toolbar-row>
                    <mat-toolbar-row class="toolbar-nav-row mj-grid mj-flex-nowrap mj-gap-2">
                        <button mat-button>Overview</button>
                        <button mat-button>Analytics</button>
                        <button mat-button>Reports</button>
                        <button mat-button>Settings</button>
                    </mat-toolbar-row>
                </mat-toolbar>
            </div>
        </section>

        <!-- ============ TABS ============ -->
        <section class="demo-section">
            <h2>Tabs</h2>
            <p class="section-desc">
                Tabs organize content across different screens or views.
                <code>active indicator &rarr; --mj-brand-primary</code>
            </p>

            <div class="demo-block">
                <h4>Basic Tabs</h4>
                <mat-tab-group [(selectedIndex)]="selectedTab" class="demo-tabs">
                    <mat-tab label="Overview">
                        <div class="tab-content">
                            <p>Overview content goes here. This tab displays a high-level summary of your data and recent activity.</p>
                        </div>
                    </mat-tab>
                    <mat-tab label="Details">
                        <div class="tab-content">
                            <p>Details content goes here. Drill down into specific metrics, records, and configuration options.</p>
                        </div>
                    </mat-tab>
                    <mat-tab label="History">
                        <div class="tab-content">
                            <p>History content goes here. Review past changes, audit logs, and version history.</p>
                        </div>
                    </mat-tab>
                </mat-tab-group>
            </div>

            <div class="demo-block">
                <h4>Tabs with Icons</h4>
                <mat-tab-group class="demo-tabs">
                    <mat-tab>
                        <ng-template mat-tab-label>
                            <mat-icon class="tab-icon">dashboard</mat-icon>
                            Dashboard
                        </ng-template>
                        <div class="tab-content">
                            <p>Dashboard view with charts, KPIs, and real-time data widgets.</p>
                        </div>
                    </mat-tab>
                    <mat-tab>
                        <ng-template mat-tab-label>
                            <mat-icon class="tab-icon">people</mat-icon>
                            Users
                        </ng-template>
                        <div class="tab-content">
                            <p>User management panel showing active users, roles, and permissions.</p>
                        </div>
                    </mat-tab>
                    <mat-tab>
                        <ng-template mat-tab-label>
                            <mat-icon class="tab-icon">settings</mat-icon>
                            Settings
                        </ng-template>
                        <div class="tab-content">
                            <p>Application settings and configuration options.</p>
                        </div>
                    </mat-tab>
                </mat-tab-group>
            </div>
        </section>

        <!-- ============ STEPPER ============ -->
        <section class="demo-section">
            <h2>Stepper</h2>
            <p class="section-desc">
                Steppers convey progress through numbered steps.
                <code>active icon &rarr; --mj-brand-primary</code>
            </p>

            <div class="demo-block">
                <h4>Horizontal Stepper</h4>
                <mat-horizontal-stepper class="demo-stepper" linear="false" #stepper>
                    <mat-step label="Account Setup">
                        <div class="step-content">
                            <p>Enter your account details including name, email, and organization.</p>
                            <div class="step-actions mj-grid mj-gap-2">
                                <button mat-flat-button matStepperNext>Next</button>
                            </div>
                        </div>
                    </mat-step>
                    <mat-step label="Preferences">
                        <div class="step-content">
                            <p>Configure your notification preferences and display settings.</p>
                            <div class="step-actions mj-grid mj-gap-2">
                                <button mat-stroked-button matStepperPrevious>Back</button>
                                <button mat-flat-button matStepperNext>Next</button>
                            </div>
                        </div>
                    </mat-step>
                    <mat-step label="Confirmation">
                        <div class="step-content">
                            <p>Review your selections and confirm to complete the setup process.</p>
                            <div class="step-actions mj-grid mj-gap-2">
                                <button mat-stroked-button matStepperPrevious>Back</button>
                                <button mat-flat-button (click)="stepper.reset()">Reset</button>
                            </div>
                        </div>
                    </mat-step>
                </mat-horizontal-stepper>
            </div>

            <div class="demo-block">
                <h4>Vertical Stepper</h4>
                <mat-vertical-stepper class="demo-stepper" linear="false" #verticalStepper>
                    <mat-step label="Select Campaign Type">
                        <div class="step-content">
                            <p>Choose between email, SMS, or push notification campaign types.</p>
                            <div class="step-actions mj-grid mj-gap-2">
                                <button mat-flat-button matStepperNext>Next</button>
                            </div>
                        </div>
                    </mat-step>
                    <mat-step label="Define Audience">
                        <div class="step-content">
                            <p>Select your target audience segments and filters.</p>
                            <div class="step-actions mj-grid mj-gap-2">
                                <button mat-stroked-button matStepperPrevious>Back</button>
                                <button mat-flat-button matStepperNext>Next</button>
                            </div>
                        </div>
                    </mat-step>
                    <mat-step label="Compose Content">
                        <div class="step-content">
                            <p>Write your message copy and choose a template layout.</p>
                            <div class="step-actions mj-grid mj-gap-2">
                                <button mat-stroked-button matStepperPrevious>Back</button>
                                <button mat-flat-button matStepperNext>Next</button>
                            </div>
                        </div>
                    </mat-step>
                    <mat-step label="Review & Send">
                        <div class="step-content">
                            <p>Review your campaign settings and schedule or send immediately.</p>
                            <div class="step-actions mj-grid mj-gap-2">
                                <button mat-stroked-button matStepperPrevious>Back</button>
                                <button mat-flat-button (click)="verticalStepper.reset()">Reset</button>
                            </div>
                        </div>
                    </mat-step>
                </mat-vertical-stepper>
            </div>
        </section>

        <!-- ============ TAB NAV BAR ============ -->
        <section class="demo-section">
            <h2>Tab Nav Bar</h2>
            <p class="section-desc">
                Route-linked navigation tabs using <code>mat-tab-nav-bar</code>.
                Unlike content tabs, these act as navigation links.
                <code>active indicator &rarr; --mj-brand-primary</code>
            </p>

            <div class="demo-block">
                <h4>Tab Nav Bar</h4>
                <nav mat-tab-nav-bar [tabPanel]="tabPanel" class="demo-tab-nav">
                    @for (link of navLinks; track link.label) {
                        <a mat-tab-link
                           (click)="ActiveNavLink = link.label"
                           [active]="ActiveNavLink === link.label">
                            <mat-icon class="tab-icon">{{ link.icon }}</mat-icon>
                            {{ link.label }}
                        </a>
                    }
                </nav>
                <mat-tab-nav-panel #tabPanel class="tab-nav-panel">
                    <div class="tab-content">
                        <p>Showing content for <strong>{{ ActiveNavLink }}</strong>. In a real app each tab link would route to a different page via the Angular Router.</p>
                    </div>
                </mat-tab-nav-panel>
            </div>
        </section>

        <!-- ============ MENU ============ -->
        <section class="demo-section">
            <h2>Menu</h2>
            <p class="section-desc">
                Menus display a list of choices on a temporary surface.
                <code>bg &rarr; --mj-bg-surface-elevated</code>
            </p>

            <div class="demo-row mj-grid mj-gap-8">
                <div class="demo-block">
                    <h4>Basic Menu</h4>
                    <button mat-flat-button [matMenuTriggerFor]="basicMenu">
                        <mat-icon>menu</mat-icon>
                        Open Menu
                    </button>
                    <mat-menu #basicMenu="matMenu">
                        <button mat-menu-item>Profile</button>
                        <button mat-menu-item>My Account</button>
                        <button mat-menu-item>Settings</button>
                        <button mat-menu-item>Log Out</button>
                    </mat-menu>
                </div>

                <div class="demo-block">
                    <h4>Menu with Icons &amp; Divider</h4>
                    <button mat-flat-button [matMenuTriggerFor]="iconMenu">
                        <mat-icon>more_vert</mat-icon>
                        Actions
                    </button>
                    <mat-menu #iconMenu="matMenu">
                        <button mat-menu-item>
                            <mat-icon>edit</mat-icon>
                            <span>Edit</span>
                        </button>
                        <button mat-menu-item>
                            <mat-icon>content_copy</mat-icon>
                            <span>Duplicate</span>
                        </button>
                        <mat-divider></mat-divider>
                        <button mat-menu-item>
                            <mat-icon>archive</mat-icon>
                            <span>Archive</span>
                        </button>
                        <button mat-menu-item>
                            <mat-icon>delete</mat-icon>
                            <span>Delete</span>
                        </button>
                    </mat-menu>
                </div>

                <div class="demo-block">
                    <h4>Nested Menu</h4>
                    <button mat-flat-button [matMenuTriggerFor]="nestedMenu">
                        <mat-icon>folder</mat-icon>
                        File
                    </button>
                    <mat-menu #nestedMenu="matMenu">
                        <button mat-menu-item [matMenuTriggerFor]="newSubmenu">
                            <mat-icon>add</mat-icon>
                            <span>New</span>
                        </button>
                        <button mat-menu-item>
                            <mat-icon>folder_open</mat-icon>
                            <span>Open</span>
                        </button>
                        <mat-divider></mat-divider>
                        <button mat-menu-item>
                            <mat-icon>save</mat-icon>
                            <span>Save</span>
                        </button>
                        <button mat-menu-item [matMenuTriggerFor]="exportSubmenu">
                            <mat-icon>ios_share</mat-icon>
                            <span>Export</span>
                        </button>
                    </mat-menu>
                    <mat-menu #newSubmenu="matMenu">
                        <button mat-menu-item>Document</button>
                        <button mat-menu-item>Spreadsheet</button>
                        <button mat-menu-item>Presentation</button>
                    </mat-menu>
                    <mat-menu #exportSubmenu="matMenu">
                        <button mat-menu-item>PDF</button>
                        <button mat-menu-item>CSV</button>
                        <button mat-menu-item>JSON</button>
                    </mat-menu>
                </div>
            </div>
        </section>

        <!-- ============ SIDENAV ============ -->
        <section class="demo-section">
            <h2>Sidenav</h2>
            <p class="section-desc">
                Side navigation provides access to destinations in your app.
                <code>bg &rarr; --mj-bg-surface</code>
            </p>

            <div class="demo-block">
                <h4>Inline Sidenav Demo</h4>
                <div class="sidenav-demo-wrapper">
                    <mat-sidenav-container class="sidenav-container">
                        <mat-sidenav
                            #sidenav
                            mode="over"
                            [opened]="sidenavOpened"
                            (openedChange)="sidenavOpened = $event"
                            class="demo-sidenav">
                            <mat-nav-list>
                                <a mat-list-item>
                                    <mat-icon matListItemIcon>home</mat-icon>
                                    <span matListItemTitle>Home</span>
                                </a>
                                <a mat-list-item>
                                    <mat-icon matListItemIcon>inbox</mat-icon>
                                    <span matListItemTitle>Inbox</span>
                                </a>
                                <a mat-list-item>
                                    <mat-icon matListItemIcon>star</mat-icon>
                                    <span matListItemTitle>Favorites</span>
                                </a>
                                <a mat-list-item>
                                    <mat-icon matListItemIcon>send</mat-icon>
                                    <span matListItemTitle>Sent</span>
                                </a>
                                <a mat-list-item>
                                    <mat-icon matListItemIcon>drafts</mat-icon>
                                    <span matListItemTitle>Drafts</span>
                                </a>
                            </mat-nav-list>
                        </mat-sidenav>

                        <mat-sidenav-content class="sidenav-content">
                            <div class="sidenav-content-inner">
                                <button mat-flat-button (click)="sidenavOpened = !sidenavOpened">
                                    <mat-icon>menu</mat-icon>
                                    Toggle Sidenav
                                </button>
                                <p class="sidenav-placeholder">
                                    Main content area. Click the button above to open the sidenav overlay.
                                </p>
                            </div>
                        </mat-sidenav-content>
                    </mat-sidenav-container>
                </div>
            </div>
        </section>

    </div>
    `,
    styles: [`
    .navigation-page {
        max-width: 900px;
    }

    /* ── Section layout ── */
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

        code {
            font-family: var(--mj-font-family-mono);
            font-size: var(--mj-text-xs);
            background: var(--mj-bg-surface-sunken);
            padding: 2px 6px;
            border-radius: var(--mj-radius-sm);
            color: var(--mj-brand-primary);
        }
    }

    .demo-block {
        margin-bottom: var(--mj-space-6);

        h4 {
            font-size: var(--mj-text-sm);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-secondary);
            margin: 0 0 var(--mj-space-3) 0;
            text-transform: uppercase;
            letter-spacing: var(--mj-tracking-wide);
        }
    }

    /* ── Toolbar ── */
    .demo-toolbar {
        background-color: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        box-shadow: var(--mj-shadow-sm);
    }

    .demo-toolbar.multi-row {
        border-radius: var(--mj-radius-lg);
    }

    .toolbar-title {
        font-size: var(--mj-text-lg);
        font-weight: var(--mj-font-semibold);
        margin-left: var(--mj-space-2);
    }

    .toolbar-spacer {
        flex: 1;
    }

    .toolbar-nav-row {
        button {
            color: var(--mj-text-secondary);
            font-size: var(--mj-text-sm);
        }
    }

    /* ── Tabs ── */
    .demo-tabs {
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        overflow: hidden;
        background: var(--mj-bg-surface);
    }

    .tab-content {
        padding: var(--mj-space-6);
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        line-height: var(--mj-leading-relaxed);
    }

    .tab-icon {
        margin-right: var(--mj-space-2);
        font-size: 20px;
        width: 20px;
        height: 20px;
    }

    /* ── Stepper ── */
    .demo-stepper {
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        overflow: hidden;
        background: var(--mj-bg-surface);
    }

    .step-content {
        padding: var(--mj-space-4) 0;
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        line-height: var(--mj-leading-relaxed);
    }

    .step-actions {
        margin-top: var(--mj-space-4);
    }

    /* ── Menu ── */
    /* Menu panel styles use Angular Material CDK overlay, so
       token mapping (--mj-bg-surface-elevated) is applied
       globally via the theme. Nothing extra needed here. */

    /* ── Sidenav ── */
    .sidenav-demo-wrapper {
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        overflow: hidden;
    }

    .sidenav-container {
        height: 320px;
        background: var(--mj-bg-surface-sunken);
    }

    .demo-sidenav {
        width: 220px;
        background: var(--mj-bg-surface);
        border-right: 1px solid var(--mj-border-default);
    }

    .sidenav-content {
        display: flex;
        align-items: flex-start;
        justify-content: center;
    }

    .sidenav-content-inner {
        padding: var(--mj-space-6);
        text-align: center;
    }

    .sidenav-placeholder {
        margin-top: var(--mj-space-4);
        color: var(--mj-text-muted);
        font-size: var(--mj-text-sm);
        line-height: var(--mj-leading-relaxed);
        max-width: 360px;
    }

    /* ── Tab Nav Bar ── */
    .demo-tab-nav {
        border: 1px solid var(--mj-border-default);
        border-bottom: none;
        border-radius: var(--mj-radius-lg) var(--mj-radius-lg) 0 0;
        background: var(--mj-bg-surface);
    }

    .tab-nav-panel {
        border: 1px solid var(--mj-border-default);
        border-top: none;
        border-radius: 0 0 var(--mj-radius-lg) var(--mj-radius-lg);
        background: var(--mj-bg-surface);
    }
    `]
})
export class NavigationComponent {
    selectedTab = 0;
    sidenavOpened = false;

    /* ── Tab Nav Bar state ── */
    navLinks = [
        { label: 'Dashboard', icon: 'dashboard' },
        { label: 'Analytics', icon: 'analytics' },
        { label: 'Reports', icon: 'description' },
        { label: 'Settings', icon: 'settings' }
    ];
    ActiveNavLink = 'Dashboard';
}
