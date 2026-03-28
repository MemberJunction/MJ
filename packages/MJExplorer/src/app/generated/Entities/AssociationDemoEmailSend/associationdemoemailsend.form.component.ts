import { Component } from '@angular/core';
import { AssociationDemoEmailSendEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Email Sends') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoemailsend-form',
    templateUrl: './associationdemoemailsend.form.component.html'
})
export class AssociationDemoEmailSendFormComponent extends BaseFormComponent {
    public record!: AssociationDemoEmailSendEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'emailClicks', sectionName: 'Email Clicks', isExpanded: false }
        ]);
    }
}

