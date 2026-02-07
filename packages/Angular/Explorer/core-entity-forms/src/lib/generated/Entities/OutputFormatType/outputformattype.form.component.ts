import { Component } from '@angular/core';
import { OutputFormatTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Output Format Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-outputformattype-form',
    templateUrl: './outputformattype.form.component.html'
})
export class OutputFormatTypeFormComponent extends BaseFormComponent {
    public record!: OutputFormatTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'formatDetails', sectionName: 'Format Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false }
        ]);
    }
}

export function LoadOutputFormatTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
