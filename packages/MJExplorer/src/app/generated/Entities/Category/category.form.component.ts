import { Component } from '@angular/core';
import { CategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-category-form',
    templateUrl: './category.form.component.html'
})
export class CategoryFormComponent extends BaseFormComponent {
    public record!: CategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'categories', sectionName: 'Categories', isExpanded: false },
            { sectionKey: 'knowledgeArticles', sectionName: 'Knowledge Articles', isExpanded: false },
            { sectionKey: 'tickets', sectionName: 'Tickets', isExpanded: false }
        ]);
    }
}

