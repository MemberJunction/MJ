import { Component } from '@angular/core';
import { MJCompanyIntegrationFieldMapEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Company Integration Field Maps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompanyintegrationfieldmap-form',
    templateUrl: './mjcompanyintegrationfieldmap.form.component.html'
})
export class MJCompanyIntegrationFieldMapFormComponent extends BaseFormComponent {
    public record!: MJCompanyIntegrationFieldMapEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mappingDefinition', sectionName: 'Mapping Definition', isExpanded: true },
            { sectionKey: 'syncLogicAndValidation', sectionName: 'Sync Logic and Validation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

