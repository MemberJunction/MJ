/**
 * @fileoverview Usage Patterns -- Stub/Coming Soon placeholder.
 */

import { Component } from '@angular/core';

@Component({
    standalone: false,
    selector: 'app-analytics-usage-patterns',
    template: `
        <div class="coming-soon">
            <div class="coming-soon__icon">
                <i class="fa-solid fa-clock"></i>
            </div>
            <h3 class="coming-soon__title">Usage Patterns</h3>
            <p class="coming-soon__subtitle">Coming Soon</p>
            <p class="coming-soon__description">
                Usage pattern analytics including peak hours, user activity heatmaps,
                and consumption forecasting will be available in a future release.
            </p>
        </div>
    `,
    styles: [`
        :host { display: block; }

        .coming-soon {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 80px 32px;
            text-align: center;
            min-height: 400px;
        }

        .coming-soon__icon {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
            font-size: 28px;
            margin-bottom: 20px;
        }

        .coming-soon__title {
            font-size: 20px;
            font-weight: 700;
            color: var(--mj-text-primary);
            margin: 0 0 6px;
        }

        .coming-soon__subtitle {
            font-size: 14px;
            font-weight: 600;
            color: var(--mj-brand-primary);
            margin: 0 0 12px;
            letter-spacing: 0.5px;
        }

        .coming-soon__description {
            font-size: 13px;
            color: var(--mj-text-muted);
            max-width: 400px;
            line-height: 1.6;
            margin: 0;
        }
    `]
})
export class AnalyticsUsagePatternsComponent { }

export function LoadAnalyticsUsagePatterns() { /* tree-shaking prevention */ }
