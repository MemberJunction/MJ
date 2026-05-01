/**
 * @module step-review.component
 * @description Step 4 wrapper — hosts EntityReviewPanelComponent.
 * Also renders server-side validation errors returned from ValidateSchema().
 */

import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import type { EntityTableSpec } from '../../../database-designer.types.js';
import { generateERDFromTableSpec } from '../../../database-designer-erd.js';

@Component({
    standalone: false,
    selector: 'mj-entity-step-review',
    templateUrl: './step-review.component.html',
    styles: [`
        .step-banner {
            display: flex; flex-direction: column; gap: 6px;
            padding: 12px 16px;
            font-size: 0.875rem;
            border-bottom: 1px solid var(--mj-border-subtle);
        }
        .step-banner-validating {
            flex-direction: row; align-items: center; gap: 10px;
            color: var(--mj-text-secondary);
        }
        .step-banner-success {
            flex-direction: row; align-items: center; gap: 10px;
            color: var(--mj-status-success-text);
            background: var(--mj-status-success-bg);
            border-color: var(--mj-status-success-border);
        }
        .step-banner-error {
            background: var(--mj-status-error-bg);
            border-color: var(--mj-status-error-border);
        }
        .banner-err-item {
            display: flex; align-items: flex-start; gap: 8px;
            color: var(--mj-status-error-text);
        }
        .entity-description {
            margin: 12px 16px 0;
            font-size: 0.875rem;
            color: var(--mj-text-secondary);
            line-height: 1.5;
        }
        .erd-container {
            padding: 0 16px 12px;
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepReviewComponent {
    @Input() public TableDefinition: Partial<EntityTableSpec> = {};
    @Input() public ValidationErrors: string[] = [];
    @Input() public IsValidating = false;

    public get AsEntityTableSpec(): EntityTableSpec | null {
        const td = this.TableDefinition;
        if (!td.EntityName || !td.TableName || !td.SchemaName) return null;
        return td as EntityTableSpec;
    }

    public get ERDMermaidBlock(): string | null {
        const spec = this.AsEntityTableSpec;
        if (!spec) return null;
        const erd = generateERDFromTableSpec([spec]);
        if (!erd) return null;
        return `\`\`\`mermaid\n${erd}\n\`\`\``;
    }
}
