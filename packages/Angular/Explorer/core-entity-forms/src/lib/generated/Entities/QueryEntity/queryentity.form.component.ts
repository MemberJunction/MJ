import { Component } from '@angular/core';
import { QueryEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Query Entities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queryentity-form',
    templateUrl: './queryentity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueryEntityFormComponent extends BaseFormComponent {
    public record!: QueryEntityEntity;

    // Collapsible section state
    public sectionsExpanded = {
        identifiers: true,
        queryMapping: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadQueryEntityFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
