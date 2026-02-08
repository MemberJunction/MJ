import { Component } from '@angular/core';
import { ContentItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Content Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contentitem-form',
    templateUrl: './contentitem.form.component.html'
})
export class ContentItemFormComponent extends BaseFormComponent {
    public record!: ContentItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'sourceInformation', sectionName: 'Source Information', isExpanded: true },
            { sectionKey: 'contentDetails', sectionName: 'Content Details', isExpanded: false },
            { sectionKey: 'contentItemAttributes', sectionName: 'Content Item Attributes', isExpanded: false },
            { sectionKey: 'contentItemTags', sectionName: 'Content Item Tags', isExpanded: false }
        ]);
    }
}

