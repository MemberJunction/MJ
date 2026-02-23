import { Component } from '@angular/core';
import { TagsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-tags-form',
    templateUrl: './tags.form.component.html'
})
export class TagsFormComponent extends BaseFormComponent {
    public record!: TagsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'companyTags', sectionName: 'Company Tags', isExpanded: false },
            { sectionKey: 'contactTags', sectionName: 'Contact Tags', isExpanded: false },
            { sectionKey: 'dealTags', sectionName: 'Deal Tags', isExpanded: false }
        ]);
    }
}

