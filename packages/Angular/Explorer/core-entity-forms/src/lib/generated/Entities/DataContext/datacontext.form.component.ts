import { Component } from '@angular/core';
import { DataContextEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Data Contexts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-datacontext-form',
    templateUrl: './datacontext.form.component.html'
})
export class DataContextFormComponent extends BaseFormComponent {
    public record!: DataContextEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'contextDetails', sectionName: 'Context Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dataContextItems', sectionName: 'Data Context Items', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false },
            { sectionKey: 'conversations', sectionName: 'Conversations', isExpanded: false }
        ]);
    }
}

export function LoadDataContextFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
