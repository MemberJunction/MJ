import { Component } from '@angular/core';
import { MJDatasetEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Datasets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdataset-form',
    templateUrl: './mjdataset.form.component.html'
})
export class MJDatasetFormComponent extends BaseFormComponent {
    public record!: MJDatasetEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'datasetCore', sectionName: 'Dataset Core', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'datasetItems', sectionName: 'Dataset Items', isExpanded: false }
        ]);
    }
}

