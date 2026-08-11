import { Component } from '@angular/core';
import { BoardGameNightPublisherEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Publishers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-boardgamenightpublisher-form',
    templateUrl: './boardgamenightpublisher.form.component.html'
})
export class BoardGameNightPublisherFormComponent extends BaseFormComponent {
    public record!: BoardGameNightPublisherEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'publisherInformation', sectionName: 'Publisher Information', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'games', sectionName: 'Games', isExpanded: false }
        ]);
    }
}

