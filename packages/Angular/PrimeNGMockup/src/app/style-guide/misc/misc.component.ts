import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { ChipModule } from 'primeng/chip';
import { BlockUIModule } from 'primeng/blockui';
import { InplaceModule } from 'primeng/inplace';
import { MeterGroupModule } from 'primeng/metergroup';
import { ProgressBarModule } from 'primeng/progressbar';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SkeletonModule } from 'primeng/skeleton';
import { ScrollTopModule } from 'primeng/scrolltop';
import { CarouselModule } from 'primeng/carousel';
import { GalleriaModule } from 'primeng/galleria';
import { ImageModule } from 'primeng/image';
import { BadgeModule } from 'primeng/badge';
import { RippleModule } from 'primeng/ripple';
import { FocusTrapModule } from 'primeng/focustrap';
import { AutoFocusModule } from 'primeng/autofocus';
import { DragDropModule } from 'primeng/dragdrop';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { ImageCompareModule } from 'primeng/imagecompare';
import { OverlayBadgeModule } from 'primeng/overlaybadge';
import { TerminalModule, TerminalService } from 'primeng/terminal';
import { StyleClassModule } from 'primeng/styleclass';
import { AnimateOnScrollModule } from 'primeng/animateonscroll';
import { Subscription } from 'rxjs';

interface CarouselItem {
    title: string;
    description: string;
    icon: string;
}

interface GalleriaItem {
    color: string;
    label: string;
}

interface MeterValue {
    label: string;
    value: number;
    color: string;
}

@Component({
    selector: 'app-misc',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        AvatarModule,
        AvatarGroupModule,
        ChipModule,
        BlockUIModule,
        InplaceModule,
        MeterGroupModule,
        ProgressBarModule,
        ProgressSpinnerModule,
        SkeletonModule,
        ScrollTopModule,
        CarouselModule,
        GalleriaModule,
        ImageModule,
        BadgeModule,
        RippleModule,
        FocusTrapModule,
        AutoFocusModule,
        DragDropModule,
        ButtonModule,
        PanelModule,
        ImageCompareModule,
        OverlayBadgeModule,
        TerminalModule,
        StyleClassModule,
        AnimateOnScrollModule
    ],
    providers: [TerminalService],
    template: `
    <div class="misc-page">
        <!-- Avatar & AvatarGroup -->
        <section class="token-section">
            <h2>Avatar &amp; AvatarGroup</h2>
            <p class="section-desc">Avatars display user initials, icons, or images. AvatarGroup stacks them with overlap.</p>
            <p class="token-mapping">Background: --mj-brand-primary | Text: --mj-brand-on-primary | Shape: circle &amp; square</p>

            <h3 class="subsection-title">Individual Avatars</h3>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <p-avatar label="MJ" shape="circle" size="large" [style]="{'background-color': 'var(--mj-brand-primary)', 'color': 'var(--mj-brand-on-primary)'}"></p-avatar>
                <p-avatar label="AB" shape="circle" size="large" [style]="{'background-color': 'var(--mj-status-success)', 'color': 'var(--mj-brand-on-primary)'}"></p-avatar>
                <p-avatar icon="pi pi-user" shape="circle" size="large" [style]="{'background-color': 'var(--mj-bg-surface-sunken)', 'color': 'var(--mj-text-secondary)'}"></p-avatar>
                <p-avatar label="XL" shape="square" size="xlarge" [style]="{'background-color': 'var(--mj-brand-primary)', 'color': 'var(--mj-brand-on-primary)'}"></p-avatar>
            </div>

            <h3 class="subsection-title">Avatar Group</h3>
            <p-avatarGroup>
                <p-avatar label="AL" shape="circle" size="large" [style]="{'background-color': '#7C3AED', 'color': 'var(--mj-brand-on-primary)'}"></p-avatar>
                <p-avatar label="BK" shape="circle" size="large" [style]="{'background-color': '#2563EB', 'color': 'var(--mj-brand-on-primary)'}"></p-avatar>
                <p-avatar label="CM" shape="circle" size="large" [style]="{'background-color': '#059669', 'color': 'var(--mj-brand-on-primary)'}"></p-avatar>
                <p-avatar label="DR" shape="circle" size="large" [style]="{'background-color': '#DC2626', 'color': 'var(--mj-brand-on-primary)'}"></p-avatar>
                <p-avatar label="+3" shape="circle" size="large" [style]="{'background-color': 'var(--mj-bg-surface-sunken)', 'color': 'var(--mj-text-secondary)'}"></p-avatar>
            </p-avatarGroup>
        </section>

        <!-- Chip -->
        <section class="token-section">
            <h2>Chip</h2>
            <p class="section-desc">Chips represent compact elements like tags or contacts. They support icons and removability.</p>
            <p class="token-mapping">Background: --mj-bg-surface-sunken | Border: --mj-border-subtle | Text: --mj-text-primary</p>

            <h3 class="subsection-title">Standard Chips</h3>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <p-chip label="Angular"></p-chip>
                <p-chip label="PrimeNG" icon="pi pi-prime"></p-chip>
                <p-chip label="TypeScript" icon="pi pi-code"></p-chip>
                <p-chip label="Node.js" icon="pi pi-server"></p-chip>
            </div>

            <h3 class="subsection-title">Removable Chips</h3>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                @for (chip of removableChips; track chip) {
                    <p-chip [label]="chip" [removable]="true" (onRemove)="OnChipRemove(chip)"></p-chip>
                }
            </div>
        </section>

        <!-- BlockUI -->
        <section class="token-section">
            <h2>BlockUI</h2>
            <p class="section-desc">Blocks a target element with an overlay to prevent user interaction during operations.</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row" style="margin-bottom: var(--mj-space-3);">
                <button pButton [label]="BlockPanel ? 'Unblock' : 'Block'" [icon]="BlockPanel ? 'pi pi-unlock' : 'pi pi-lock'" (click)="BlockPanel = !BlockPanel" class="p-button-outlined"></button>
            </div>

            <p-blockUI [target]="blockTarget" [blocked]="BlockPanel">
                <i class="pi pi-lock" style="font-size: 2rem; color: var(--mj-text-muted);"></i>
            </p-blockUI>
            <p-panel #blockTarget header="Blockable Panel">
                <p>This panel can be blocked with the button above. When blocked, an overlay prevents all user interaction with the content below.</p>
                <button pButton label="Click Me" class="p-button-primary p-button-sm" style="margin-top: var(--mj-space-3);"></button>
            </p-panel>
        </section>

        <!-- Inplace -->
        <section class="token-section">
            <h2>Inplace</h2>
            <p class="section-desc">Click-to-edit inline content. Displays a read-only view that switches to an editable form on activation.</p>

            <p-inplace [closable]="true">
                <ng-template pTemplate="display">
                    <span class="inplace-display">Click here to edit this text</span>
                </ng-template>
                <ng-template pTemplate="content">
                    <input type="text" pInputText value="Click here to edit this text" [pAutoFocus]="true" />
                </ng-template>
            </p-inplace>
        </section>

        <!-- MeterGroup -->
        <section class="token-section">
            <h2>MeterGroup</h2>
            <p class="section-desc">Visualizes multiple values as proportional segments in a meter bar, ideal for storage or resource usage.</p>
            <p class="token-mapping">Segments use custom colors | Track: --mj-bg-surface-sunken</p>

            <p-meterGroup [value]="meterValues" [max]="100"></p-meterGroup>
            <div class="mj-grid mj-gap-5 meter-legend">
                @for (val of meterValues; track val.label) {
                    <div class="mj-grid mj-flex-nowrap mj-gap-2 mj-align-center meter-legend-item">
                        <span class="meter-legend-color" [style.background-color]="val.color"></span>
                        <span class="meter-legend-label">{{ val.label }}</span>
                        <span class="meter-legend-value">{{ val.value }}%</span>
                    </div>
                }
            </div>
        </section>

        <!-- ProgressBar -->
        <section class="token-section">
            <h2>ProgressBar</h2>
            <p class="section-desc">Displays the progress of a task. Supports determinate (percentage) and indeterminate (unknown duration) modes.</p>
            <p class="token-mapping">Fill: --mj-brand-primary | Track: --mj-bg-surface-sunken</p>

            <h3 class="subsection-title">Determinate (65%)</h3>
            <p-progressBar [value]="65"></p-progressBar>

            <h3 class="subsection-title">Indeterminate</h3>
            <p-progressBar mode="indeterminate" [style]="{'height': '6px'}"></p-progressBar>
        </section>

        <!-- ProgressSpinner -->
        <section class="token-section">
            <h2>ProgressSpinner</h2>
            <p class="section-desc">An animated circular spinner indicating loading or processing state.</p>
            <p class="token-mapping">Stroke: --mj-brand-primary</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <p-progressSpinner [style]="{width: '50px', height: '50px'}" strokeWidth="4"></p-progressSpinner>
                <p-progressSpinner [style]="{width: '30px', height: '30px'}" strokeWidth="6" animationDuration="1s"></p-progressSpinner>
            </div>
        </section>

        <!-- Skeleton -->
        <section class="token-section">
            <h2>Skeleton</h2>
            <p class="section-desc">Skeleton placeholders provide a loading preview of content before data is available.</p>
            <p class="token-mapping">Background: --mj-bg-surface-sunken | Animation: shimmer</p>

            <div class="mj-grid mj-gap-5">
                <div class="mj-col-md-6 skeleton-card mj-grid mj-flex-nowrap mj-gap-4">
                    <p-skeleton shape="circle" size="4rem"></p-skeleton>
                    <div class="mj-grid mj-flex-column mj-gap-2 skeleton-lines">
                        <p-skeleton width="70%" height="1rem"></p-skeleton>
                        <p-skeleton width="50%" height="0.75rem"></p-skeleton>
                        <p-skeleton width="90%" height="0.75rem"></p-skeleton>
                    </div>
                </div>
                <div class="mj-col-md-6 skeleton-block">
                    <p-skeleton width="100%" height="8rem" borderRadius="var(--mj-radius-md)"></p-skeleton>
                </div>
                <div class="mj-col-12 mj-grid mj-flex-column mj-gap-2">
                    <p-skeleton width="100%" height="2rem"></p-skeleton>
                    <p-skeleton width="100%" height="2rem"></p-skeleton>
                    <p-skeleton width="100%" height="2rem"></p-skeleton>
                </div>
            </div>
        </section>

        <!-- ScrollTop -->
        <section class="token-section">
            <h2>ScrollTop</h2>
            <p class="section-desc">A button that appears when scrolling down a container or the page, allowing the user to jump back to the top.</p>

            <div class="scrolltop-demo">
                <div class="scroll-container">
                    @for (i of scrollItems; track i) {
                        <p class="scroll-line">Scroll content line {{ i }} -- keep scrolling to see the ScrollTop button appear.</p>
                    }
                    <p-scrollTop target="parent" [threshold]="50" icon="pi pi-arrow-up" [behavior]="'smooth'"></p-scrollTop>
                </div>
            </div>
        </section>

        <!-- Carousel -->
        <section class="token-section">
            <h2>Carousel</h2>
            <p class="section-desc">A content slider that cycles through items with navigation controls and optional autoplay.</p>

            <p-carousel [value]="carouselItems" [numVisible]="3" [numScroll]="1" [circular]="true">
                <ng-template let-item pTemplate="item">
                    <div class="carousel-card">
                        <i [class]="item.icon" class="carousel-icon"></i>
                        <h4 class="carousel-title">{{ item.title }}</h4>
                        <p class="carousel-desc">{{ item.description }}</p>
                    </div>
                </ng-template>
            </p-carousel>
        </section>

        <!-- Galleria -->
        <section class="token-section">
            <h2>Galleria</h2>
            <p class="section-desc">An advanced image gallery with thumbnail navigation. Using colored placeholder panels here since no images are available.</p>

            <p-galleria [value]="galleriaItems" [numVisible]="5" [style]="{'max-width': '640px'}">
                <ng-template pTemplate="item" let-item>
                    <div class="galleria-placeholder" [style.background-color]="item.color">
                        <span>{{ item.label }}</span>
                    </div>
                </ng-template>
                <ng-template pTemplate="thumbnail" let-item>
                    <div class="galleria-thumb" [style.background-color]="item.color">
                        <span>{{ item.label }}</span>
                    </div>
                </ng-template>
            </p-galleria>
        </section>

        <!-- Image -->
        <section class="token-section">
            <h2>Image</h2>
            <p class="section-desc">Enhanced image component with preview overlay on click. Uses a generated SVG placeholder.</p>

            <p-image src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect fill='%234f46e5' width='320' height='200'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='sans-serif' font-size='18'%3ESample Image%3C/text%3E%3C/svg%3E" alt="Placeholder" width="320" [preview]="true"></p-image>
        </section>

        <!-- Badge -->
        <section class="token-section">
            <h2>Badge &amp; BadgeDirective</h2>
            <p class="section-desc">Badges provide notification counts or status indicators. Can be used as standalone components or as directives on buttons and icons.</p>
            <p class="token-mapping">Default: --mj-brand-primary | Severities: --mj-status-*</p>

            <h3 class="subsection-title">Standalone Badges</h3>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <p-badge value="4"></p-badge>
                <p-badge value="8" severity="success"></p-badge>
                <p-badge value="2" severity="warn"></p-badge>
                <p-badge value="1" severity="danger"></p-badge>
                <p-badge value="99+" severity="info"></p-badge>
            </div>

            <h3 class="subsection-title">Badge Directive on Buttons</h3>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Notifications" icon="pi pi-bell" pBadge value="5" class="p-button-outlined"></button>
                <button pButton label="Messages" icon="pi pi-envelope" pBadge value="3" badgeSeverity="danger" class="p-button-outlined"></button>
                <i class="pi pi-bell" style="font-size: 1.5rem; color: var(--mj-text-primary);" pBadge value="2"></i>
            </div>
        </section>

        <!-- Ripple -->
        <section class="token-section">
            <h2>Ripple</h2>
            <p class="section-desc">The pRipple directive adds a Material Design-style ripple effect on click to any element.</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <div class="ripple-box" pRipple>
                    Click me for ripple
                </div>
                <div class="ripple-box ripple-brand" pRipple>
                    Brand ripple
                </div>
            </div>
        </section>

        <!-- FocusTrap -->
        <section class="token-section">
            <h2>FocusTrap</h2>
            <p class="section-desc">Traps keyboard Tab focus within a container. Useful for modal-like sections. Try pressing Tab inside the box below.</p>

            <div class="mj-grid mj-gap-3 mj-align-center focustrap-demo" pFocusTrap>
                <label class="focustrap-label">Focus is trapped in this container:</label>
                <input type="text" pInputText placeholder="First field" class="focustrap-input" />
                <input type="text" pInputText placeholder="Second field" class="focustrap-input" />
                <button pButton label="Trapped Button" class="p-button-primary p-button-sm"></button>
            </div>
        </section>

        <!-- AutoFocus -->
        <section class="token-section">
            <h2>AutoFocus</h2>
            <p class="section-desc">The pAutoFocus directive automatically focuses an element when it appears in the DOM.</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Toggle Input" class="p-button-outlined p-button-sm" (click)="ShowAutoFocusInput = !ShowAutoFocusInput"></button>
            </div>
            @if (ShowAutoFocusInput) {
                <div class="autofocus-demo">
                    <input type="text" pInputText placeholder="I am auto-focused!" [pAutoFocus]="true" />
                </div>
            }
        </section>

        <!-- DragDrop -->
        <section class="token-section">
            <h2>Drag &amp; Drop</h2>
            <p class="section-desc">Drag items from the Available list and drop them into the Selected list using PrimeNG pDraggable and pDroppable directives.</p>

            <div class="mj-grid mj-gap-5 dragdrop-container">
                <div class="mj-col dragdrop-list">
                    <h4 class="dragdrop-header">Available</h4>
                    @for (item of AvailableItems; track item) {
                        <div class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center dragdrop-item" pDraggable="items" (onDragStart)="OnDragStart(item)" (onDragEnd)="OnDragEnd()">
                            <i class="pi pi-bars drag-handle"></i>
                            <span>{{ item }}</span>
                        </div>
                    }
                    @if (AvailableItems.length === 0) {
                        <div class="dragdrop-empty">No items available</div>
                    }
                </div>

                <div class="dragdrop-arrow">
                    <i class="pi pi-arrow-right"></i>
                </div>

                <div class="mj-col dragdrop-list" pDroppable="items" (onDrop)="OnDrop()">
                    <h4 class="dragdrop-header">Selected</h4>
                    @for (item of SelectedItems; track item) {
                        <div class="mj-grid mj-flex-nowrap mj-gap-3 mj-align-center dragdrop-item dragdrop-item-selected">
                            <i class="pi pi-check"></i>
                            <span>{{ item }}</span>
                        </div>
                    }
                    @if (SelectedItems.length === 0) {
                        <div class="dragdrop-empty">Drop items here</div>
                    }
                </div>
            </div>
        </section>

        <!-- ImageCompare -->
        <section class="token-section">
            <h2>ImageCompare</h2>
            <p class="section-desc">Before/after image comparison slider. Drag the handle to compare two overlapping images or content panels.</p>
            <p class="token-mapping">Slider handle: --mj-brand-primary | Container: --mj-border-default</p>

            <div class="component-row image-compare-demo">
                <p-imageCompare>
                    <ng-template pTemplate="left">
                        <div class="compare-panel compare-left">
                            <span>Before</span>
                        </div>
                    </ng-template>
                    <ng-template pTemplate="right">
                        <div class="compare-panel compare-right">
                            <span>After</span>
                        </div>
                    </ng-template>
                </p-imageCompare>
            </div>
        </section>

        <!-- OverlayBadge -->
        <section class="token-section">
            <h2>OverlayBadge</h2>
            <p class="section-desc">Overlays a badge on any child content, such as icons or avatars, to indicate counts or status.</p>
            <p class="token-mapping">Badge: --mj-brand-primary | Severity variants: --mj-status-*</p>

            <div class="mj-grid mj-gap-5 mj-align-center component-row">
                <p-overlayBadge value="3">
                    <i class="pi pi-bell" style="font-size: 1.75rem; color: var(--mj-text-primary);"></i>
                </p-overlayBadge>
                <p-overlayBadge value="7" severity="danger">
                    <i class="pi pi-envelope" style="font-size: 1.75rem; color: var(--mj-text-primary);"></i>
                </p-overlayBadge>
                <p-overlayBadge value="2" severity="success">
                    <p-avatar label="MJ" shape="circle" size="large" [style]="{'background-color': 'var(--mj-brand-primary)', 'color': 'var(--mj-brand-on-primary)'}"></p-avatar>
                </p-overlayBadge>
                <p-overlayBadge value="99+" severity="warn">
                    <i class="pi pi-inbox" style="font-size: 1.75rem; color: var(--mj-text-primary);"></i>
                </p-overlayBadge>
            </div>
        </section>

        <!-- Terminal -->
        <section class="token-section">
            <h2>Terminal</h2>
            <p class="section-desc">Terminal-style text interface. Accepts typed commands and displays responses via TerminalService.</p>
            <p class="token-mapping">Background: --mj-bg-surface-sunken | Text: --mj-text-primary | Prompt: --mj-brand-primary</p>

            <div class="component-row terminal-demo">
                <p-terminal welcomeMessage="Welcome to MJ Terminal. Type 'help' for available commands." prompt="mj $"></p-terminal>
            </div>
        </section>

        <!-- StyleClass -->
        <section class="token-section">
            <h2>StyleClass</h2>
            <p class="section-desc">Directive for declarative CSS class toggling. Useful for show/hide animations without component state management.</p>
            <p class="token-mapping">Uses toggleClass to add/remove CSS classes on a target element</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Toggle Panel" icon="pi pi-eye" class="p-button-outlined" [pStyleClass]="'@next'" toggleClass="styleclass-hidden"></button>
                <div class="styleclass-panel">
                    <div class="styleclass-panel-content">
                        <i class="pi pi-check-circle"></i>
                        <span>This panel is toggled using the <strong>pStyleClass</strong> directive. No component property binding needed.</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- AnimateOnScroll -->
        <section class="token-section">
            <h2>AnimateOnScroll</h2>
            <p class="section-desc">Directive that applies CSS animations when an element enters the viewport during scrolling.</p>
            <p class="token-mapping">Uses IntersectionObserver | enterClass/leaveClass for CSS animation classes</p>

            <div class="animate-scroll-demo">
                <p class="animate-scroll-hint">Scroll down inside this container to see the animation trigger.</p>
                <div class="animate-scroll-container">
                    <div class="animate-scroll-spacer"></div>
                    <div pAnimateOnScroll enterClass="animate-fade-in" [once]="false" class="animate-scroll-target">
                        <i class="pi pi-sparkles" style="font-size: 1.5rem;"></i>
                        <h4>Animated Content</h4>
                        <p>This element fades in when it enters the viewport during scrolling.</p>
                    </div>
                    <div class="animate-scroll-spacer"></div>
                </div>
            </div>
        </section>
    </div>
  `,
    styles: [`
    .misc-page {
        max-width: 1100px;
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

    /* Inplace */
    .inplace-display {
        color: var(--mj-brand-primary);
        cursor: pointer;
        font-weight: var(--mj-font-medium);
        padding: var(--mj-space-2) var(--mj-space-3);
        border-radius: var(--mj-radius-md);
        transition: background-color var(--mj-transition-fast);

        &:hover {
            background-color: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent);
        }
    }

    /* MeterGroup Legend */
    .meter-legend {
        margin-top: var(--mj-space-4);
    }

    .meter-legend-item {
    }

    .meter-legend-color {
        width: 12px;
        height: 12px;
        border-radius: var(--mj-radius-sm);
        flex-shrink: 0;
    }

    .meter-legend-label {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
        font-weight: var(--mj-font-medium);
    }

    .meter-legend-value {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-muted);
    }

    /* Skeleton Demo */
    .skeleton-card {
        padding: var(--mj-space-4);
        background: var(--mj-bg-surface-elevated);
        border-radius: var(--mj-radius-lg);
        border: 1px solid var(--mj-border-subtle);
    }

    .skeleton-lines {
        justify-content: center;
    }

    .skeleton-block {
    }

    /* ScrollTop Demo */
    .scrolltop-demo {
        position: relative;
    }

    .scroll-container {
        height: 180px;
        overflow-y: auto;
        padding: var(--mj-space-4);
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-md);
        position: relative;
    }

    .scroll-line {
        padding: var(--mj-space-2) 0;
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
        border-bottom: 1px solid var(--mj-border-subtle);
        margin: 0;
    }

    /* Carousel */
    .carousel-card {
        text-align: center;
        padding: var(--mj-space-5);
        margin: var(--mj-space-2);
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-lg);
    }

    .carousel-icon {
        font-size: 2rem;
        color: var(--mj-brand-primary);
        margin-bottom: var(--mj-space-3);
        display: block;
    }

    .carousel-title {
        font-size: var(--mj-text-base);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
        margin: 0 0 var(--mj-space-2) 0;
    }

    .carousel-desc {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
        margin: 0;
        line-height: var(--mj-leading-relaxed);
    }

    /* Galleria */
    .galleria-placeholder {
        height: 300px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--mj-radius-md);

        span {
            font-size: var(--mj-text-xl);
            font-weight: var(--mj-font-bold);
            color: var(--mj-brand-on-primary);
        }
    }

    .galleria-thumb {
        width: 80px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--mj-radius-sm);
        cursor: pointer;

        span {
            font-size: var(--mj-text-xs);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-brand-on-primary);
        }
    }

    /* Ripple Box */
    .ripple-box {
        padding: var(--mj-space-5) var(--mj-space-8);
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        cursor: pointer;
        user-select: none;
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-medium);
        color: var(--mj-text-primary);
        position: relative;
        overflow: hidden;
        transition: border-color var(--mj-transition-fast);

        &:hover {
            border-color: var(--mj-border-focus);
        }
    }

    .ripple-brand {
        background: var(--mj-brand-primary);
        color: var(--mj-brand-on-primary);
        border-color: var(--mj-brand-primary);

        &:hover {
            border-color: var(--mj-brand-primary);
        }
    }

    /* FocusTrap */
    .focustrap-demo {
        padding: var(--mj-space-5);
        background: var(--mj-bg-surface-elevated);
        border: 2px dashed var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
    }

    .focustrap-label {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
        font-weight: var(--mj-font-medium);
        width: 100%;
        margin-bottom: var(--mj-space-1);
    }

    .focustrap-input {
        flex: 1;
        min-width: 160px;
    }

    /* AutoFocus */
    .autofocus-demo {
        margin-top: var(--mj-space-3);
        padding: var(--mj-space-4);
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-md);
    }

    /* DragDrop */
    .dragdrop-container {
    }

    .dragdrop-list {
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        padding: var(--mj-space-4);
        min-height: 200px;
    }

    .dragdrop-header {
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-bold);
        text-transform: uppercase;
        letter-spacing: var(--mj-tracking-wide);
        color: var(--mj-text-muted);
        margin: 0 0 var(--mj-space-3) 0;
        padding-bottom: var(--mj-space-2);
        border-bottom: 1px solid var(--mj-border-subtle);
    }

    .dragdrop-item {
        padding: var(--mj-space-2-5) var(--mj-space-3);
        margin-bottom: var(--mj-space-2);
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-md);
        cursor: grab;
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
        transition: all var(--mj-transition-fast);

        &:hover {
            border-color: var(--mj-brand-primary);
            background: color-mix(in srgb, var(--mj-brand-primary) 4%, var(--mj-bg-surface));
        }
    }

    .dragdrop-item-selected {
        background: color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface));
        border-color: color-mix(in srgb, var(--mj-brand-primary) 30%, transparent);

        i {
            color: var(--mj-status-success);
        }
    }

    .drag-handle {
        color: var(--mj-text-muted);
        font-size: var(--mj-text-xs);
    }

    .dragdrop-arrow {
        display: flex;
        align-items: center;
        padding-top: 100px;
        color: var(--mj-text-muted);
        font-size: var(--mj-text-xl);
    }

    .dragdrop-empty {
        text-align: center;
        padding: var(--mj-space-8) var(--mj-space-4);
        color: var(--mj-text-muted);
        font-size: var(--mj-text-sm);
        font-style: italic;
    }

    /* ImageCompare */
    .image-compare-demo {
        max-width: 600px;
    }

    .compare-panel {
        width: 600px;
        height: 300px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--mj-radius-md);

        span {
            font-size: var(--mj-text-2xl);
            font-weight: var(--mj-font-bold);
            color: white;
            text-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
    }

    .compare-left {
        background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    }

    .compare-right {
        background: linear-gradient(135deg, #059669 0%, #0ea5e9 100%);
    }

    /* Terminal */
    .terminal-demo {
        max-width: 600px;
    }

    /* StyleClass */
    .styleclass-panel {
        transition: all 0.3s ease;
        overflow: hidden;
    }

    .styleclass-hidden {
        display: none !important;
    }

    .styleclass-panel-content {
        display: flex;
        align-items: center;
        gap: var(--mj-space-3);
        padding: var(--mj-space-4);
        background: color-mix(in srgb, var(--mj-status-success-bg) 60%, transparent);
        border: 1px solid var(--mj-status-success-text);
        border-radius: var(--mj-radius-md);
        font-size: var(--mj-text-sm);
        color: var(--mj-status-success-text);

        i {
            font-size: var(--mj-text-xl);
            flex-shrink: 0;
        }
    }

    /* AnimateOnScroll */
    .animate-scroll-demo {
    }

    .animate-scroll-hint {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-muted);
        font-style: italic;
        margin: 0 0 var(--mj-space-3) 0;
    }

    .animate-scroll-container {
        height: 250px;
        overflow-y: auto;
        padding: var(--mj-space-4);
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-md);
        position: relative;
    }

    .animate-scroll-spacer {
        height: 300px;
    }

    .animate-scroll-target {
        text-align: center;
        padding: var(--mj-space-6);
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        opacity: 0;

        h4 {
            margin: var(--mj-space-2) 0 var(--mj-space-1) 0;
            font-size: var(--mj-text-base);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-primary);
        }

        p {
            margin: 0;
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
        }

        i {
            color: var(--mj-brand-primary);
        }
    }

    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    :host ::ng-deep .animate-fade-in {
        animation: fadeInUp 0.6s ease forwards;
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
export class MiscComponent implements OnInit, OnDestroy {
    private terminalService = inject(TerminalService);
    private terminalSubscription: Subscription | null = null;

    BlockPanel = false;
    ShowAutoFocusInput = false;

    removableChips: string[] = ['Design', 'Development', 'Testing', 'Deployment', 'Monitoring'];

    meterValues: MeterValue[] = [
        { label: 'Documents', value: 35, color: '#4f46e5' },
        { label: 'Images', value: 22, color: '#0ea5e9' },
        { label: 'Videos', value: 18, color: '#f59e0b' },
        { label: 'Other', value: 10, color: '#94a3b8' }
    ];

    carouselItems: CarouselItem[] = [
        { title: 'Entity Framework', description: 'Strongly typed entities with auto-generated CRUD.', icon: 'pi pi-database' },
        { title: 'AI Integration', description: 'Built-in support for AI models and prompt management.', icon: 'pi pi-bolt' },
        { title: 'Code Generation', description: 'Auto-generated TypeScript classes and Angular forms.', icon: 'pi pi-code' },
        { title: 'Workflow Engine', description: 'Metadata-driven actions and orchestration.', icon: 'pi pi-sitemap' },
        { title: 'Role-Based Access', description: 'Granular permissions on entities and fields.', icon: 'pi pi-shield' },
        { title: 'Dashboard Builder', description: 'Configurable dashboards with reusable components.', icon: 'pi pi-chart-bar' }
    ];

    galleriaItems: GalleriaItem[] = [
        { color: '#4f46e5', label: 'Indigo' },
        { color: '#0ea5e9', label: 'Sky' },
        { color: '#059669', label: 'Emerald' },
        { color: '#f59e0b', label: 'Amber' },
        { color: '#ef4444', label: 'Red' }
    ];

    scrollItems: number[] = Array.from({ length: 30 }, (_, i) => i + 1);

    AvailableItems: string[] = ['Entities', 'Actions', 'Queries', 'Reports', 'Dashboards'];
    SelectedItems: string[] = [];
    DraggedItem: string | null = null;

    ngOnInit() {
        this.terminalSubscription = this.terminalService.commandHandler.subscribe(command => {
            this.HandleTerminalCommand(command);
        });
    }

    ngOnDestroy() {
        if (this.terminalSubscription) {
            this.terminalSubscription.unsubscribe();
        }
    }

    HandleTerminalCommand(command: string) {
        const cmd = command.trim().toLowerCase();
        switch (cmd) {
            case 'help':
                this.terminalService.sendResponse('Available commands: help, version, date, clear, echo <text>');
                break;
            case 'version':
                this.terminalService.sendResponse('MJ Style Guide v1.0 | PrimeNG v21');
                break;
            case 'date':
                this.terminalService.sendResponse(new Date().toLocaleString());
                break;
            default:
                if (cmd.startsWith('echo ')) {
                    this.terminalService.sendResponse(command.substring(5));
                } else {
                    this.terminalService.sendResponse(`Unknown command: ${command}. Type 'help' for available commands.`);
                }
        }
    }

    OnChipRemove(chip: string) {
        this.removableChips = this.removableChips.filter(c => c !== chip);
    }

    OnDragStart(item: string) {
        this.DraggedItem = item;
    }

    OnDragEnd() {
        this.DraggedItem = null;
    }

    OnDrop() {
        if (this.DraggedItem) {
            const index = this.AvailableItems.indexOf(this.DraggedItem);
            if (index >= 0) {
                this.AvailableItems.splice(index, 1);
                this.SelectedItems.push(this.DraggedItem);
                this.DraggedItem = null;
            }
        }
    }
}
