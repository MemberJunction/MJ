import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

interface ColorSwatch {
    token: string;
    label: string;
    cssVar: string;
    textClass: string;
}

interface ColorGroup {
    title: string;
    description: string;
    swatches: ColorSwatch[];
}

@Component({
    selector: 'app-colors',
    standalone: true,
    imports: [CommonModule, CardModule],
    template: `
    <div class="colors-page">
        <!-- Primitives: Brand -->
        <section class="token-section">
            <h2>Brand Colors</h2>
            <p class="section-desc">Primary blue palette. The 500 value is MJ's signature blue (#0076b6), 900 is MJ Navy (#092340).</p>
            <div class="mj-row mj-row-cols-2 mj-row-cols-sm-3 mj-row-cols-md-4 mj-row-cols-lg-6 mj-gap-3">
                @for (s of brandSwatches; track s.token) {
                    <div class="swatch-card">
                        <div class="swatch-color mj-grid mj-align-end mj-justify-start" [style.background-color]="'var(' + s.cssVar + ')'"
                             [class.light-text]="s.textClass === 'light'">
                            <span class="swatch-value" [id]="'val-' + s.token">{{ GetComputedValue(s.cssVar) }}</span>
                        </div>
                        <div class="swatch-info mj-grid mj-flex-column mj-gap-0">
                            <span class="swatch-token">{{ s.cssVar }}</span>
                            <span class="swatch-label">{{ s.label }}</span>
                        </div>
                    </div>
                }
            </div>
        </section>

        <!-- Primitives: Accent -->
        <section class="token-section">
            <h2>Accent Colors</h2>
            <p class="section-desc">Light blue highlights from the MJ website. Used for emphasis and callouts.</p>
            <div class="mj-row mj-row-cols-2 mj-row-cols-sm-3 mj-row-cols-md-4 mj-row-cols-lg-6 mj-gap-3">
                @for (s of accentSwatches; track s.token) {
                    <div class="swatch-card">
                        <div class="swatch-color mj-grid mj-align-end mj-justify-start" [style.background-color]="'var(' + s.cssVar + ')'"
                             [class.light-text]="s.textClass === 'light'">
                            <span class="swatch-value">{{ GetComputedValue(s.cssVar) }}</span>
                        </div>
                        <div class="swatch-info mj-grid mj-flex-column mj-gap-0">
                            <span class="swatch-token">{{ s.cssVar }}</span>
                            <span class="swatch-label">{{ s.label }}</span>
                        </div>
                    </div>
                }
            </div>
        </section>

        <!-- Primitives: Tertiary -->
        <section class="token-section">
            <h2>Tertiary Colors</h2>
            <p class="section-desc">Cyan/Teal palette for secondary actions and complementary highlights.</p>
            <div class="mj-row mj-row-cols-2 mj-row-cols-sm-3 mj-row-cols-md-4 mj-row-cols-lg-6 mj-gap-3">
                @for (s of tertiarySwatches; track s.token) {
                    <div class="swatch-card">
                        <div class="swatch-color mj-grid mj-align-end mj-justify-start" [style.background-color]="'var(' + s.cssVar + ')'"
                             [class.light-text]="s.textClass === 'light'">
                            <span class="swatch-value">{{ GetComputedValue(s.cssVar) }}</span>
                        </div>
                        <div class="swatch-info mj-grid mj-flex-column mj-gap-0">
                            <span class="swatch-token">{{ s.cssVar }}</span>
                            <span class="swatch-label">{{ s.label }}</span>
                        </div>
                    </div>
                }
            </div>
        </section>

        <!-- Primitives: Neutral -->
        <section class="token-section">
            <h2>Neutral Colors</h2>
            <p class="section-desc">Slate palette used for backgrounds, text, borders, and surfaces.</p>
            <div class="mj-row mj-row-cols-2 mj-row-cols-sm-3 mj-row-cols-md-4 mj-row-cols-lg-6 mj-gap-3">
                @for (s of neutralSwatches; track s.token) {
                    <div class="swatch-card">
                        <div class="swatch-color mj-grid mj-align-end mj-justify-start" [style.background-color]="'var(' + s.cssVar + ')'"
                             [class.light-text]="s.textClass === 'light'"
                             [class.bordered]="s.textClass === 'bordered'">
                            <span class="swatch-value">{{ GetComputedValue(s.cssVar) }}</span>
                        </div>
                        <div class="swatch-info mj-grid mj-flex-column mj-gap-0">
                            <span class="swatch-token">{{ s.cssVar }}</span>
                            <span class="swatch-label">{{ s.label }}</span>
                        </div>
                    </div>
                }
            </div>
        </section>

        <!-- Semantic: Backgrounds -->
        <section class="token-section">
            <h2>Semantic: Backgrounds</h2>
            <p class="section-desc">Purpose-based background tokens. These change automatically between light and dark mode.</p>
            <div class="mj-row mj-row-cols-2 mj-row-cols-sm-3 mj-row-cols-md-4 mj-row-cols-lg-6 mj-gap-3">
                @for (s of bgSwatches; track s.token) {
                    <div class="swatch-card">
                        <div class="swatch-color mj-grid mj-align-end mj-justify-start" [style.background-color]="'var(' + s.cssVar + ')'"
                             [class.light-text]="s.textClass === 'light'"
                             [class.bordered]="s.textClass === 'bordered' || s.textClass === 'dark'">
                            <span class="swatch-value">{{ GetComputedValue(s.cssVar) }}</span>
                        </div>
                        <div class="swatch-info mj-grid mj-flex-column mj-gap-0">
                            <span class="swatch-token">{{ s.cssVar }}</span>
                            <span class="swatch-label">{{ s.label }}</span>
                        </div>
                    </div>
                }
            </div>
        </section>

        <!-- Semantic: Status Colors -->
        <section class="token-section">
            <h2>Status Colors</h2>
            <p class="section-desc">Semantic status indicators with background, text, and border variants.</p>
            <div class="mj-row mj-row-cols-sm-2 mj-row-cols-lg-3 mj-gap-4">
                @for (status of statusGroups; track status.name) {
                    <div class="status-group">
                        <h4>{{ status.name }}</h4>
                        <div class="status-variants">
                            <div class="status-variant mj-grid mj-flex-column mj-gap-1"
                                 [style.background-color]="'var(--mj-status-' + status.key + '-bg)'"
                                 [style.color]="'var(--mj-status-' + status.key + '-text)'"
                                 [style.border]="'1px solid var(--mj-status-' + status.key + '-border)'">
                                <span class="status-label">{{ status.name }}</span>
                                <span class="status-token">--mj-status-{{ status.key }}-*</span>
                            </div>
                        </div>
                    </div>
                }
            </div>
        </section>

        <!-- Highlight -->
        <section class="token-section">
            <h2>Highlight & App Accent</h2>
            <p class="section-desc">Special-purpose tokens for important callouts, notifications, and per-application accent colors.</p>
            <div class="mj-row mj-row-cols-2 mj-row-cols-sm-3 mj-row-cols-md-4 mj-row-cols-lg-6 mj-gap-3">
                @for (s of highlightSwatches; track s.token) {
                    <div class="swatch-card">
                        <div class="swatch-color mj-grid mj-align-end mj-justify-start" [style.background-color]="'var(' + s.cssVar + ')'"
                             [class.light-text]="s.textClass === 'light'"
                             [class.bordered]="s.textClass === 'bordered'">
                            <span class="swatch-value">{{ GetComputedValue(s.cssVar) }}</span>
                        </div>
                        <div class="swatch-info mj-grid mj-flex-column mj-gap-0">
                            <span class="swatch-token">{{ s.cssVar }}</span>
                            <span class="swatch-label">{{ s.label }}</span>
                        </div>
                    </div>
                }
            </div>
        </section>
    </div>
  `,
    styles: [`
    .colors-page {
        max-width: 1200px;
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
        margin: 0 0 var(--mj-space-5) 0;
        line-height: var(--mj-leading-relaxed);
    }

    .swatch-card {
        border-radius: var(--mj-radius-lg);
        overflow: hidden;
        box-shadow: var(--mj-shadow-sm);
        background: var(--mj-bg-surface);
        transition: transform var(--mj-transition-base), box-shadow var(--mj-transition-base);

        &:hover {
            transform: translateY(-2px);
            box-shadow: var(--mj-shadow-md);
        }
    }

    .swatch-color {
        height: 80px;
        padding: var(--mj-space-2);
        color: var(--mj-color-neutral-900);

        &.light-text {
            color: var(--mj-color-neutral-0);
        }

        &.bordered {
            border: 1px solid var(--mj-border-default);
            border-bottom: none;
        }
    }

    .swatch-value {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        font-weight: var(--mj-font-medium);
        opacity: 0.9;
    }

    .swatch-info {
        padding: var(--mj-space-2);
    }

    .swatch-token {
        font-family: var(--mj-font-family-mono);
        font-size: 10px;
        color: var(--mj-text-muted);
        word-break: break-all;
    }

    .swatch-label {
        font-size: var(--mj-text-xs);
        color: var(--mj-text-secondary);
    }

    .status-group h4 {
        margin: 0 0 var(--mj-space-2) 0;
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
    }

    .status-variant {
        padding: var(--mj-space-3) var(--mj-space-4);
        border-radius: var(--mj-radius-md);
    }

    .status-label {
        font-weight: var(--mj-font-semibold);
        font-size: var(--mj-text-sm);
    }

    .status-token {
        font-family: var(--mj-font-family-mono);
        font-size: 10px;
        opacity: 0.7;
    }

  `]
})
export class ColorsComponent implements OnInit {
    brandSwatches: ColorSwatch[] = [
        { token: 'brand-50', label: '50', cssVar: '--mj-color-brand-50', textClass: 'dark' },
        { token: 'brand-100', label: '100', cssVar: '--mj-color-brand-100', textClass: 'dark' },
        { token: 'brand-200', label: '200', cssVar: '--mj-color-brand-200', textClass: 'dark' },
        { token: 'brand-300', label: '300', cssVar: '--mj-color-brand-300', textClass: 'dark' },
        { token: 'brand-400', label: '400', cssVar: '--mj-color-brand-400', textClass: 'light' },
        { token: 'brand-500', label: '500 (Primary)', cssVar: '--mj-color-brand-500', textClass: 'light' },
        { token: 'brand-600', label: '600', cssVar: '--mj-color-brand-600', textClass: 'light' },
        { token: 'brand-700', label: '700', cssVar: '--mj-color-brand-700', textClass: 'light' },
        { token: 'brand-800', label: '800', cssVar: '--mj-color-brand-800', textClass: 'light' },
        { token: 'brand-900', label: '900 (Navy)', cssVar: '--mj-color-brand-900', textClass: 'light' },
    ];

    accentSwatches: ColorSwatch[] = [
        { token: 'accent-50', label: '50', cssVar: '--mj-color-accent-50', textClass: 'dark' },
        { token: 'accent-100', label: '100', cssVar: '--mj-color-accent-100', textClass: 'dark' },
        { token: 'accent-200', label: '200', cssVar: '--mj-color-accent-200', textClass: 'dark' },
        { token: 'accent-300', label: '300 (Light Blue)', cssVar: '--mj-color-accent-300', textClass: 'dark' },
        { token: 'accent-400', label: '400 (Skip Agent)', cssVar: '--mj-color-accent-400', textClass: 'dark' },
        { token: 'accent-500', label: '500 (Accent)', cssVar: '--mj-color-accent-500', textClass: 'light' },
        { token: 'accent-600', label: '600', cssVar: '--mj-color-accent-600', textClass: 'light' },
        { token: 'accent-700', label: '700', cssVar: '--mj-color-accent-700', textClass: 'light' },
        { token: 'accent-800', label: '800', cssVar: '--mj-color-accent-800', textClass: 'light' },
        { token: 'accent-900', label: '900', cssVar: '--mj-color-accent-900', textClass: 'light' },
    ];

    tertiarySwatches: ColorSwatch[] = [
        { token: 'tertiary-50', label: '50', cssVar: '--mj-color-tertiary-50', textClass: 'dark' },
        { token: 'tertiary-100', label: '100', cssVar: '--mj-color-tertiary-100', textClass: 'dark' },
        { token: 'tertiary-200', label: '200', cssVar: '--mj-color-tertiary-200', textClass: 'dark' },
        { token: 'tertiary-300', label: '300', cssVar: '--mj-color-tertiary-300', textClass: 'dark' },
        { token: 'tertiary-400', label: '400', cssVar: '--mj-color-tertiary-400', textClass: 'dark' },
        { token: 'tertiary-500', label: '500 (Cyan)', cssVar: '--mj-color-tertiary-500', textClass: 'light' },
        { token: 'tertiary-600', label: '600', cssVar: '--mj-color-tertiary-600', textClass: 'light' },
        { token: 'tertiary-700', label: '700', cssVar: '--mj-color-tertiary-700', textClass: 'light' },
        { token: 'tertiary-800', label: '800', cssVar: '--mj-color-tertiary-800', textClass: 'light' },
        { token: 'tertiary-900', label: '900', cssVar: '--mj-color-tertiary-900', textClass: 'light' },
    ];

    neutralSwatches: ColorSwatch[] = [
        { token: 'neutral-0', label: '0 (White)', cssVar: '--mj-color-neutral-0', textClass: 'bordered' },
        { token: 'neutral-50', label: '50', cssVar: '--mj-color-neutral-50', textClass: 'bordered' },
        { token: 'neutral-100', label: '100', cssVar: '--mj-color-neutral-100', textClass: 'dark' },
        { token: 'neutral-200', label: '200', cssVar: '--mj-color-neutral-200', textClass: 'dark' },
        { token: 'neutral-300', label: '300', cssVar: '--mj-color-neutral-300', textClass: 'dark' },
        { token: 'neutral-400', label: '400', cssVar: '--mj-color-neutral-400', textClass: 'dark' },
        { token: 'neutral-500', label: '500', cssVar: '--mj-color-neutral-500', textClass: 'light' },
        { token: 'neutral-600', label: '600', cssVar: '--mj-color-neutral-600', textClass: 'light' },
        { token: 'neutral-700', label: '700', cssVar: '--mj-color-neutral-700', textClass: 'light' },
        { token: 'neutral-800', label: '800', cssVar: '--mj-color-neutral-800', textClass: 'light' },
        { token: 'neutral-900', label: '900', cssVar: '--mj-color-neutral-900', textClass: 'light' },
        { token: 'neutral-950', label: '950', cssVar: '--mj-color-neutral-950', textClass: 'light' },
    ];

    bgSwatches: ColorSwatch[] = [
        { token: 'bg-page', label: 'Page Background', cssVar: '--mj-bg-page', textClass: 'bordered' },
        { token: 'bg-surface', label: 'Surface', cssVar: '--mj-bg-surface', textClass: 'bordered' },
        { token: 'bg-elevated', label: 'Elevated', cssVar: '--mj-bg-surface-elevated', textClass: 'bordered' },
        { token: 'bg-sunken', label: 'Sunken', cssVar: '--mj-bg-surface-sunken', textClass: 'bordered' },
        { token: 'bg-hover', label: 'Hover', cssVar: '--mj-bg-surface-hover', textClass: 'bordered' },
        { token: 'bg-active', label: 'Active', cssVar: '--mj-bg-surface-active', textClass: 'dark' },
    ];

    statusGroups = [
        { name: 'Success', key: 'success' },
        { name: 'Warning', key: 'warning' },
        { name: 'Error', key: 'error' },
        { name: 'Info', key: 'info' },
    ];

    highlightSwatches: ColorSwatch[] = [
        { token: 'highlight', label: 'Highlight', cssVar: '--mj-highlight', textClass: 'dark' },
        { token: 'highlight-hover', label: 'Highlight Hover', cssVar: '--mj-highlight-hover', textClass: 'dark' },
        { token: 'highlight-subtle', label: 'Highlight Subtle', cssVar: '--mj-highlight-subtle', textClass: 'bordered' },
        { token: 'app-accent', label: 'App Accent', cssVar: '--mj-app-accent', textClass: 'dark' },
        { token: 'app-accent-subtle', label: 'App Accent Subtle', cssVar: '--mj-app-accent-subtle', textClass: 'bordered' },
    ];

    private computedValues: Map<string, string> = new Map();

    ngOnInit() {
        this.RefreshComputedValues();
        // Re-compute when theme changes
        const observer = new MutationObserver(() => this.RefreshComputedValues());
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    GetComputedValue(cssVar: string): string {
        return this.computedValues.get(cssVar) || '';
    }

    private RefreshComputedValues() {
        const style = getComputedStyle(document.documentElement);
        const allSwatches = [
            ...this.brandSwatches,
            ...this.accentSwatches,
            ...this.tertiarySwatches,
            ...this.neutralSwatches,
            ...this.bgSwatches,
            ...this.highlightSwatches,
        ];
        this.computedValues = new Map();
        for (const s of allSwatches) {
            const raw = style.getPropertyValue(s.cssVar).trim();
            this.computedValues.set(s.cssVar, raw);
        }
    }
}
