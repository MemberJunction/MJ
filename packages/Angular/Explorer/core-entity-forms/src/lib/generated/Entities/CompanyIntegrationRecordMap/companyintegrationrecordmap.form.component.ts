import { Component } from '@angular/core';
import { CompanyIntegrationRecordMapEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Integration Record Maps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-companyintegrationrecordmap-form',
    templateUrl: './companyintegrationrecordmap.form.component.html'
})
export class CompanyIntegrationRecordMapFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRecordMapEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'integrationKeys', sectionName: 'Integration Keys', isExpanded: true },
            { sectionKey: 'mappingDetails', sectionName: 'Mapping Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

