import { Component } from '@angular/core';
import { DataContextItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Data Context Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-datacontextitem-form',
    templateUrl: './datacontextitem.form.component.html'
})
export class DataContextItemFormComponent extends BaseFormComponent {
    public record!: DataContextItemEntity;

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

