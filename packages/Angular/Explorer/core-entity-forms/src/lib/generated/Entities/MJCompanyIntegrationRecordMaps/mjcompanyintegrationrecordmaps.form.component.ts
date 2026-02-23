import { Component } from '@angular/core';
import { MJCompanyIntegrationRecordMapsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Company Integration Record Maps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompanyintegrationrecordmaps-form',
    templateUrl: './mjcompanyintegrationrecordmaps.form.component.html'
})
export class MJCompanyIntegrationRecordMapsFormComponent extends BaseFormComponent {
    public record!: MJCompanyIntegrationRecordMapsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'integrationKeys', sectionName: 'Integration Keys', isExpanded: true },
            { sectionKey: 'mappingDetails', sectionName: 'Mapping Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

