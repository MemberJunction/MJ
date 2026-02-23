import { Component } from '@angular/core';
import { MJDatasetItemsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dataset Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdatasetitems-form',
    templateUrl: './mjdatasetitems.form.component.html'
})
export class MJDatasetItemsFormComponent extends BaseFormComponent {
    public record!: MJDatasetItemsEntity;

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

