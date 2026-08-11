import { Component } from '@angular/core';
import { BoardGameNightPlaySessionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Play Sessions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-boardgamenightplaysession-form',
    templateUrl: './boardgamenightplaysession.form.component.html'
})
export class BoardGameNightPlaySessionFormComponent extends BaseFormComponent {
    public record!: BoardGameNightPlaySessionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sessionDetails', sectionName: 'Session Details', isExpanded: true },
            { sectionKey: 'sessionPerformance', sectionName: 'Session Performance', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'playSessionPlayers', sectionName: 'Play Session Players', isExpanded: false }
        ]);
    }
}

