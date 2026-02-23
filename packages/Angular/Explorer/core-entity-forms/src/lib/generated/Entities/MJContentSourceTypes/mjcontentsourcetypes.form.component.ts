import { Component } from '@angular/core';
import { MJContentSourceTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Content Source Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentsourcetypes-form',
    templateUrl: './mjcontentsourcetypes.form.component.html'
})
export class MJContentSourceTypesFormComponent extends BaseFormComponent {
    public record!: MJContentSourceTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'contentSources', sectionName: 'Content Sources', isExpanded: false },
            { sectionKey: 'contentItems', sectionName: 'Content Items', isExpanded: false }
        ]);
    }
}

