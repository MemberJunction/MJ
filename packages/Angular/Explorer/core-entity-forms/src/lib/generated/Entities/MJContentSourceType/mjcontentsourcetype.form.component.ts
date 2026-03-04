import { Component } from '@angular/core';
import { MJContentSourceTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Content Source Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentsourcetype-form',
    templateUrl: './mjcontentsourcetype.form.component.html'
})
export class MJContentSourceTypeFormComponent extends BaseFormComponent {
    public record!: MJContentSourceTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJContentSources', sectionName: 'Content Sources', isExpanded: false },
            { sectionKey: 'mJContentItems', sectionName: 'Content Items', isExpanded: false }
        ]);
    }
}

