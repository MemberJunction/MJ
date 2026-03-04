import { Component } from '@angular/core';
import { MenuCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Menu Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-menucategory-form',
    templateUrl: './menucategory.form.component.html'
})
export class MenuCategoryFormComponent extends BaseFormComponent {
    public record!: MenuCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'menuItems', sectionName: 'Menu Items', isExpanded: false }
        ]);
    }
}

