import { Component } from '@angular/core';
import { MJContentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Content Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontenttype-form',
    templateUrl: './mjcontenttype.form.component.html'
})
export class MJContentTypeFormComponent extends BaseFormComponent {
    public record!: MJContentTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'aIModelSettings', sectionName: 'AI Model Settings', isExpanded: true },
            { sectionKey: 'mJContentSources', sectionName: 'Content Sources', isExpanded: false },
            { sectionKey: 'mJContentItems', sectionName: 'Content Items', isExpanded: false }
        ]);
    }
}

