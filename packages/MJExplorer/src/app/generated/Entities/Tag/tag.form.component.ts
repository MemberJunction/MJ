import { Component } from '@angular/core';
import { TagEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-tag-form',
    templateUrl: './tag.form.component.html'
})
export class TagFormComponent extends BaseFormComponent {
    public record!: TagEntity;

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

