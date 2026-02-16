import { Component } from '@angular/core';
import { MJCompanyIntegrationRecordMapEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Company Integration Record Maps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompanyintegrationrecordmap-form',
    templateUrl: './mjcompanyintegrationrecordmap.form.component.html'
})
export class MJCompanyIntegrationRecordMapFormComponent extends BaseFormComponent {
    public record!: MJCompanyIntegrationRecordMapEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'integrationKeys', sectionName: 'Integration Keys', isExpanded: true },
            { sectionKey: 'mappingDetails', sectionName: 'Mapping Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

