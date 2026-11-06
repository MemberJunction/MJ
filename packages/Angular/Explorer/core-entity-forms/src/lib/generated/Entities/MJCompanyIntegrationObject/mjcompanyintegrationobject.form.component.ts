import { Component } from '@angular/core';
import { MJCompanyIntegrationObjectEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Company Integration Objects') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompanyintegrationobject-form',
    templateUrl: './mjcompanyintegrationobject.form.component.html'
})
export class MJCompanyIntegrationObjectFormComponent extends BaseFormComponent {
    public record!: MJCompanyIntegrationObjectEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCompanyIntegrationObjectFieldsCompanyIntegrationObjectID', sectionName: 'Company Integration Object Fields (Company Integration Object ID)', isExpanded: false },
            { sectionKey: 'mJCompanyIntegrationObjectFieldsRelatedCompanyIntegrationObjectID', sectionName: 'Company Integration Object Fields (Related Company Integration Object ID)', isExpanded: false }
        ]);
    }
}

