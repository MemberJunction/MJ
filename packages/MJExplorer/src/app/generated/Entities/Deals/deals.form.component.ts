import { Component } from '@angular/core';
import { DealsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Deals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-deals-form',
    templateUrl: './deals.form.component.html'
})
export class DealsFormComponent extends BaseFormComponent {
    public record!: DealsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'activities', sectionName: 'Activities', isExpanded: false },
            { sectionKey: 'dealProducts', sectionName: 'Deal Products', isExpanded: false },
            { sectionKey: 'dealTags', sectionName: 'Deal Tags', isExpanded: false }
        ]);
    }
}

