import { Component } from '@angular/core';
import { QueryParameterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Query Parameters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-queryparameter-form',
    templateUrl: './queryparameter.form.component.html'
})
export class QueryParameterFormComponent extends BaseFormComponent {
    public record!: QueryParameterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'parameterCore', sectionName: 'Parameter Core', isExpanded: true },
            { sectionKey: 'parameterGuidanceValidation', sectionName: 'Parameter Guidance & Validation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

