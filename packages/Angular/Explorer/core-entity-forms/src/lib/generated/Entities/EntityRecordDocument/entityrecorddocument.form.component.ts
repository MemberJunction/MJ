import { Component } from '@angular/core';
import { EntityRecordDocumentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Record Documents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityrecorddocument-form',
    templateUrl: './entityrecorddocument.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityRecordDocumentFormComponent extends BaseFormComponent {
    public record!: EntityRecordDocumentEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityRecordDocumentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
