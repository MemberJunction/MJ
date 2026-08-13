import { Component } from '@angular/core';
import { MJExternalDataSourceTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: External Data Source Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjexternaldatasourcetype-form',
    templateUrl: './mjexternaldatasourcetype.form.component.html'
})
export class MJExternalDataSourceTypeFormComponent extends BaseFormComponent {
    public record!: MJExternalDataSourceTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJExternalDataSources', sectionName: 'External Data Sources', isExpanded: false }
        ]);
    }
}

