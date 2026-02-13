import { Component } from '@angular/core';
import { MJOutputFormatTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Output Format Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoutputformattype-form',
    templateUrl: './mjoutputformattype.form.component.html'
})
export class MJOutputFormatTypeFormComponent extends BaseFormComponent {
    public record!: MJOutputFormatTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'formatDetails', sectionName: 'Format Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false }
        ]);
    }
}

