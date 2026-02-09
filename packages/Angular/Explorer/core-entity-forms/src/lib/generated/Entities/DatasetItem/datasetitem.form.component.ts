import { Component } from '@angular/core';
import { DatasetItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Dataset Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-datasetitem-form',
    templateUrl: './datasetitem.form.component.html'
})
export class DatasetItemFormComponent extends BaseFormComponent {
    public record!: DatasetItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'itemIdentity', sectionName: 'Item Identity', isExpanded: true },
            { sectionKey: 'processingSettings', sectionName: 'Processing Settings', isExpanded: true },
            { sectionKey: 'displayDocumentation', sectionName: 'Display & Documentation', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

