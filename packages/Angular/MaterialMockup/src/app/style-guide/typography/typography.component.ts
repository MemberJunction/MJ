import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-typography',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="typography-page">
        <!-- Font Families -->
        <section class="token-section">
            <h2>Font Families</h2>
            <p class="section-desc">MJ uses Inter as the primary font and JetBrains Mono for code/monospace.</p>

            <div class="font-sample-card">
                <div class="font-sample-header mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                    <span class="font-name">Inter (Primary)</span>
                    <code class="token-code">--mj-font-family</code>
                </div>
                <p class="font-sample" style="font-family: var(--mj-font-family);">
                    The quick brown fox jumps over the lazy dog. 0123456789
                </p>
            </div>

            <div class="font-sample-card">
                <div class="font-sample-header mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                    <span class="font-name">JetBrains Mono (Code)</span>
                    <code class="token-code">--mj-font-family-mono</code>
                </div>
                <p class="font-sample" style="font-family: var(--mj-font-family-mono);">
                    const token = 'design-system'; // 0123456789
                </p>
            </div>
        </section>

        <!-- Size Scale -->
        <section class="token-section">
            <h2>Size Scale</h2>
            <p class="section-desc">Type sizes from xs (12px) through 4xl (36px).</p>

            <div class="mj-grid mj-flex-column mj-gap-1">
                @for (size of sizeScale; track size.token) {
                    <div class="size-row mj-grid mj-flex-nowrap mj-gap-6 mj-align-baseline">
                        <div class="size-meta mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                            <code class="token-code">{{ size.token }}</code>
                            <span class="size-value">{{ size.value }}</span>
                        </div>
                        <div class="size-sample" [style.font-size]="'var(' + size.token + ')'">
                            The quick brown fox jumps over the lazy dog
                        </div>
                    </div>
                }
            </div>
        </section>

        <!-- Font Weights -->
        <section class="token-section">
            <h2>Font Weights</h2>
            <p class="section-desc">Available weight variants for text hierarchy and emphasis.</p>

            <div class="mj-row mj-row-cols-sm-2 mj-row-cols-md-3 mj-row-cols-lg-4 mj-gap-4">
                @for (weight of fontWeights; track weight.token) {
                    <div class="weight-card">
                        <span class="weight-sample" [style.font-weight]="'var(' + weight.token + ')'">Aa</span>
                        <div class="mj-grid mj-flex-column mj-gap-1">
                            <span class="weight-name">{{ weight.name }}</span>
                            <code class="token-code">{{ weight.token }}</code>
                            <span class="weight-value">{{ weight.value }}</span>
                        </div>
                    </div>
                }
            </div>
        </section>

        <!-- Line Heights -->
        <section class="token-section">
            <h2>Line Heights</h2>
            <p class="section-desc">Line height tokens control vertical rhythm and readability.</p>

            <div class="mj-grid mj-flex-column mj-gap-4">
                @for (lh of lineHeights; track lh.token) {
                    <div class="lh-card">
                        <div class="lh-header mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                            <code class="token-code">{{ lh.token }}</code>
                            <span class="lh-value">{{ lh.value }}</span>
                        </div>
                        <p class="lh-sample" [style.line-height]="'var(' + lh.token + ')'">
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                            Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                            Ut enim ad minim veniam.
                        </p>
                    </div>
                }
            </div>
        </section>

        <!-- Letter Spacing -->
        <section class="token-section">
            <h2>Letter Spacing</h2>
            <p class="section-desc">Tracking values for fine-tuning text appearance.</p>

            <div class="mj-grid mj-flex-column mj-gap-4">
                @for (t of letterSpacings; track t.token) {
                    <div class="tracking-card">
                        <div class="tracking-header mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                            <code class="token-code">{{ t.token }}</code>
                            <span class="tracking-value">{{ t.value }}</span>
                        </div>
                        <p class="tracking-sample" [style.letter-spacing]="'var(' + t.token + ')'">
                            ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz
                        </p>
                    </div>
                }
            </div>
        </section>
    </div>
  `,
    styles: [`
    .typography-page {
        max-width: 900px;
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
        margin: 0 0 var(--mj-space-5) 0;
        line-height: var(--mj-leading-relaxed);
    }

    .token-code {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent);
        padding: var(--mj-space-0-5) var(--mj-space-2);
        border-radius: var(--mj-radius-sm);
    }

    /* Font Family Cards */
    .font-sample-card {
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        padding: var(--mj-space-5);
        margin-bottom: var(--mj-space-4);
    }

    .font-sample-header {
        margin-bottom: var(--mj-space-3);
    }

    .font-name {
        font-weight: var(--mj-font-semibold);
        font-size: var(--mj-text-base);
        color: var(--mj-text-primary);
    }

    .font-sample {
        font-size: var(--mj-text-xl);
        color: var(--mj-text-primary);
        margin: 0;
        line-height: var(--mj-leading-relaxed);
    }

    /* Size Scale Table */
    .size-row {
        padding: var(--mj-space-3) var(--mj-space-4);
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-md);
    }

    .size-meta {
        min-width: 220px;
    }

    .size-value {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
    }

    .size-sample {
        color: var(--mj-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Font Weights */
    .weight-card {
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        padding: var(--mj-space-5);
        text-align: center;
    }

    .weight-sample {
        font-size: var(--mj-text-4xl);
        color: var(--mj-text-primary);
        display: block;
        margin-bottom: var(--mj-space-3);
    }

    .weight-name {
        font-weight: var(--mj-font-semibold);
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
    }

    .weight-value {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
    }

    /* Line Heights */
    .lh-card {
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        padding: var(--mj-space-4);
    }

    .lh-header {
        margin-bottom: var(--mj-space-3);
    }

    .lh-value {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
    }

    .lh-sample {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
        margin: 0;
        max-width: 600px;
    }

    /* Letter Spacing */
    .tracking-card {
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        padding: var(--mj-space-4);
    }

    .tracking-header {
        margin-bottom: var(--mj-space-3);
    }

    .tracking-value {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
    }

    .tracking-sample {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
        margin: 0;
    }
  `]
})
export class TypographyComponent {
    sizeScale = [
        { token: '--mj-text-xs', value: '0.75rem / 12px' },
        { token: '--mj-text-sm', value: '0.875rem / 14px' },
        { token: '--mj-text-base', value: '1rem / 16px' },
        { token: '--mj-text-lg', value: '1.125rem / 18px' },
        { token: '--mj-text-xl', value: '1.25rem / 20px' },
        { token: '--mj-text-2xl', value: '1.5rem / 24px' },
        { token: '--mj-text-3xl', value: '1.875rem / 30px' },
        { token: '--mj-text-4xl', value: '2.25rem / 36px' },
    ];

    fontWeights = [
        { token: '--mj-font-normal', name: 'Normal', value: '400' },
        { token: '--mj-font-medium', name: 'Medium', value: '500' },
        { token: '--mj-font-semibold', name: 'Semibold', value: '600' },
        { token: '--mj-font-bold', name: 'Bold', value: '700' },
    ];

    lineHeights = [
        { token: '--mj-leading-none', value: '1' },
        { token: '--mj-leading-tight', value: '1.25' },
        { token: '--mj-leading-snug', value: '1.375' },
        { token: '--mj-leading-normal', value: '1.5' },
        { token: '--mj-leading-relaxed', value: '1.625' },
        { token: '--mj-leading-loose', value: '2' },
    ];

    letterSpacings = [
        { token: '--mj-tracking-tighter', value: '-0.05em' },
        { token: '--mj-tracking-tight', value: '-0.025em' },
        { token: '--mj-tracking-normal', value: '0' },
        { token: '--mj-tracking-wide', value: '0.025em' },
        { token: '--mj-tracking-wider', value: '0.05em' },
    ];
}
