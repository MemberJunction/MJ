import { Component } from '@angular/core';
import { bettyContentItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Content Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-bettycontentitem-form',
    templateUrl: './bettycontentitem.form.component.html'
})
export class bettyContentItemFormComponent extends BaseFormComponent {
    public record!: bettyContentItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'contentItems', sectionName: 'Content Items', isExpanded: false }
        ]);
    }
}

