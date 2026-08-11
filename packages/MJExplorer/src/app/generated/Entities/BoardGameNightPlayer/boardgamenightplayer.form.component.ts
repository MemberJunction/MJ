import { Component } from '@angular/core';
import { BoardGameNightPlayerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Players') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-boardgamenightplayer-form',
    templateUrl: './boardgamenightplayer.form.component.html'
})
export class BoardGameNightPlayerFormComponent extends BaseFormComponent {
    public record!: BoardGameNightPlayerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'personalInformation', sectionName: 'Personal Information', isExpanded: true },
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: true },
            { sectionKey: 'membershipDetails', sectionName: 'Membership Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'playSessionPlayers', sectionName: 'Play Session Players', isExpanded: false }
        ]);
    }
}

