import { Component } from '@angular/core';
import { DatasetEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Datasets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dataset-form',
    templateUrl: './dataset.form.component.html'
})
export class DatasetFormComponent extends BaseFormComponent {
    public record!: DatasetEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'datasetCore', sectionName: 'Dataset Core', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'datasetItems', sectionName: 'Dataset Items', isExpanded: false }
        ]);
    }
}

