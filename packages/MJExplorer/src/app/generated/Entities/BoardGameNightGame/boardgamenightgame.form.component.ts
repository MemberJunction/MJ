import { Component } from '@angular/core';
import { BoardGameNightGameEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Games') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-boardgamenightgame-form',
    templateUrl: './boardgamenightgame.form.component.html'
})
export class BoardGameNightGameFormComponent extends BaseFormComponent {
    public record!: BoardGameNightGameEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'gameProfile', sectionName: 'Game Profile', isExpanded: true },
            { sectionKey: 'gameplaySpecifications', sectionName: 'Gameplay Specifications', isExpanded: true },
            { sectionKey: 'collectionDetails', sectionName: 'Collection Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'gameDesigners', sectionName: 'Game Designers', isExpanded: false },
            { sectionKey: 'playSessions', sectionName: 'Play Sessions', isExpanded: false }
        ]);
    }
}

