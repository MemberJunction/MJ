import { Component } from '@angular/core';
import { MJQueryParametersEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Query Parameters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjqueryparameters-form',
    templateUrl: './mjqueryparameters.form.component.html'
})
export class MJQueryParametersFormComponent extends BaseFormComponent {
    public record!: MJQueryParametersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'parameterCore', sectionName: 'Parameter Core', isExpanded: true },
            { sectionKey: 'parameterGuidanceValidation', sectionName: 'Parameter Guidance & Validation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

