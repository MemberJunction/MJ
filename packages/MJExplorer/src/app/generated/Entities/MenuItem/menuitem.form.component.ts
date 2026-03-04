import { Component } from '@angular/core';
import { MenuItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Menu Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-menuitem-form',
    templateUrl: './menuitem.form.component.html'
})
export class MenuItemFormComponent extends BaseFormComponent {
    public record!: MenuItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'orderItems', sectionName: 'Order Items', isExpanded: false }
        ]);
    }
}

