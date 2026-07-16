import { Component } from '@angular/core';
import { constantcontacteventsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactevents-form',
    templateUrl: './constantcontactevents.form.component.html'
})
export class constantcontacteventsFormComponent extends BaseFormComponent {
    public record!: constantcontacteventsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'eventsCopies', sectionName: 'Events Copies', isExpanded: false }
        ]);
    }
}

