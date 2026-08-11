import { Component } from '@angular/core';
import { BoardGameNightPlaySessionPlayerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Play Session Players') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-boardgamenightplaysessionplayer-form',
    templateUrl: './boardgamenightplaysessionplayer.form.component.html'
})
export class BoardGameNightPlaySessionPlayerFormComponent extends BaseFormComponent {
    public record!: BoardGameNightPlaySessionPlayerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'gameResults', sectionName: 'Game Results', isExpanded: true },
            { sectionKey: 'playerDetails', sectionName: 'Player Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

