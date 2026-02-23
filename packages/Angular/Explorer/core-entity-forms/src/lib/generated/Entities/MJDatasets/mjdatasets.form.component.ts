import { Component } from '@angular/core';
import { MJDatasetsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Datasets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdatasets-form',
    templateUrl: './mjdatasets.form.component.html'
})
export class MJDatasetsFormComponent extends BaseFormComponent {
    public record!: MJDatasetsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'datasetCore', sectionName: 'Dataset Core', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'datasetItems', sectionName: 'Dataset Items', isExpanded: false }
        ]);
    }
}

