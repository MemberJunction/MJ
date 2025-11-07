import { Component } from '@angular/core';
import { QueryParameterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Query Parameters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queryparameter-form',
    templateUrl: './queryparameter.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueryParameterFormComponent extends BaseFormComponent {
    public record!: QueryParameterEntity;

    // Collapsible section state
    public sectionsExpanded = {
        parameterCore: true,
        parameterGuidanceValidation: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadQueryParameterFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
