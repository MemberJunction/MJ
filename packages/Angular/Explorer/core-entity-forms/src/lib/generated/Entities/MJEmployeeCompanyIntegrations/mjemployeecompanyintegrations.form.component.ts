import { Component } from '@angular/core';
import { MJEmployeeCompanyIntegrationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Employee Company Integrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjemployeecompanyintegrations-form',
    templateUrl: './mjemployeecompanyintegrations.form.component.html'
})
export class MJEmployeeCompanyIntegrationsFormComponent extends BaseFormComponent {
    public record!: MJEmployeeCompanyIntegrationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'integrationMapping', sectionName: 'Integration Mapping', isExpanded: true },
            { sectionKey: 'externalIdentifier', sectionName: 'External Identifier', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

