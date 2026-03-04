import { Component } from '@angular/core';
import { ClientEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Clients') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-client-form',
    templateUrl: './client.form.component.html'
})
export class ClientFormComponent extends BaseFormComponent {
    public record!: ClientEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'offers', sectionName: 'Offers', isExpanded: false },
            { sectionKey: 'showings', sectionName: 'Showings', isExpanded: false },
            { sectionKey: 'transactions', sectionName: 'Transactions', isExpanded: false }
        ]);
    }
}

