import { Component } from '@angular/core';
import { MJDataContextItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Data Context Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdatacontextitem-form',
    templateUrl: './mjdatacontextitem.form.component.html'
})
export class MJDataContextItemFormComponent extends BaseFormComponent {
    public record!: MJDataContextItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'itemIdentification', sectionName: 'Item Identification', isExpanded: true },
            { sectionKey: 'sourceDefinition', sectionName: 'Source Definition', isExpanded: true },
            { sectionKey: 'cachedSnapshot', sectionName: 'Cached Snapshot', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

