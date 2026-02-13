import { Component } from '@angular/core';
import { MJEmployeeCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Employee Company Integrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjemployeecompanyintegration-form',
    templateUrl: './mjemployeecompanyintegration.form.component.html'
})
export class MJEmployeeCompanyIntegrationFormComponent extends BaseFormComponent {
    public record!: MJEmployeeCompanyIntegrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'integrationMapping', sectionName: 'Integration Mapping', isExpanded: true },
            { sectionKey: 'externalIdentifier', sectionName: 'External Identifier', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

