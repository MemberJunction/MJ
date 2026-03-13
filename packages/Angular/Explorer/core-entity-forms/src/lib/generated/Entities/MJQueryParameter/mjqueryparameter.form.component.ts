import { Component } from '@angular/core';
import { MJQueryParameterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Query Parameters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjqueryparameter-form',
    templateUrl: './mjqueryparameter.form.component.html'
})
export class MJQueryParameterFormComponent extends BaseFormComponent {
    public record!: MJQueryParameterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'parameterCore', sectionName: 'Parameter Core', isExpanded: true },
            { sectionKey: 'parameterGuidanceValidation', sectionName: 'Parameter Guidance & Validation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

