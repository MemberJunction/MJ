import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import {
    MJEntityRelationshipEntity,
    MJEntityRelationshipEntity_IEntityRelationshipConfiguration,
} from '@memberjunction/core-entities';

type FormRoleChoice = 'Auto' | 'Primary' | 'Detail';

/**
 * Form-role editor for a single Entity Relationship. Writes `Configuration.UI.FormRole`
 * (or clears it for Auto) so the parent entity's ranker / explicit punches stay in sync.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'entity-relationships:form-role',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: Entity Relationships',
        slot: 'after-fields',
        sortKey: 120,
    },
})
@Component({
    standalone: false,
    selector: 'mj-entity-relationship-form-role-panel',
    templateUrl: './entity-relationship-form-role.panel.html',
    styleUrls: ['./entity-form-chrome-editor.component.css'],
})
export class EntityRelationshipFormRolePanel extends BaseFormPanel<MJEntityRelationshipEntity> {
    public readonly Choices: { text: string; value: FormRoleChoice }[] = [
        { text: 'Auto (parent ranker)', value: 'Auto' },
        { text: 'Primary (always top-level)', value: 'Primary' },
        { text: 'Detail (always in More)', value: 'Detail' },
    ];

    public get FormRole(): FormRoleChoice {
        const role = this.Record?.ConfigurationObject?.UI?.FormRole;
        return role === 'Primary' || role === 'Detail' ? role : 'Auto';
    }

    public OnRoleChange(value: FormRoleChoice | unknown): void {
        if (value !== 'Auto' && value !== 'Primary' && value !== 'Detail') return;
        if (!this.Record) return;
        const current: MJEntityRelationshipEntity_IEntityRelationshipConfiguration =
            this.Record.ConfigurationObject ?? {};
        const ui = { ...(current.UI ?? {}) };
        if (value === 'Auto') {
            delete ui.FormRole;
        } else {
            ui.FormRole = value;
        }
        const next: MJEntityRelationshipEntity_IEntityRelationshipConfiguration = { ...current };
        if (Object.keys(ui).length === 0) {
            delete next.UI;
        } else {
            next.UI = ui;
        }
        this.Record.ConfigurationObject = Object.keys(next).length === 0 ? null : next;
    }
}
