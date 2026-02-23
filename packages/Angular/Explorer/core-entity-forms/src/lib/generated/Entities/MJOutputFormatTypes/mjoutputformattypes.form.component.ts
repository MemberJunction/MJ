import { Component } from '@angular/core';
import { MJOutputFormatTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Output Format Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoutputformattypes-form',
    templateUrl: './mjoutputformattypes.form.component.html'
})
export class MJOutputFormatTypesFormComponent extends BaseFormComponent {
    public record!: MJOutputFormatTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'formatDetails', sectionName: 'Format Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false }
        ]);
    }
}

