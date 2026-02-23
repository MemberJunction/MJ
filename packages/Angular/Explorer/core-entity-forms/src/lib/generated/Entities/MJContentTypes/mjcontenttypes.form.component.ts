import { Component } from '@angular/core';
import { MJContentTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Content Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontenttypes-form',
    templateUrl: './mjcontenttypes.form.component.html'
})
export class MJContentTypesFormComponent extends BaseFormComponent {
    public record!: MJContentTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'aIModelSettings', sectionName: 'AI Model Settings', isExpanded: true },
            { sectionKey: 'contentSources', sectionName: 'Content Sources', isExpanded: false },
            { sectionKey: 'contentItems', sectionName: 'Content Items', isExpanded: false }
        ]);
    }
}

