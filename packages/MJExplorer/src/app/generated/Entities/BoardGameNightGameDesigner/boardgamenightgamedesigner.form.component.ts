import { Component } from '@angular/core';
import { BoardGameNightGameDesignerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Game Designers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-boardgamenightgamedesigner-form',
    templateUrl: './boardgamenightgamedesigner.form.component.html'
})
export class BoardGameNightGameDesignerFormComponent extends BaseFormComponent {
    public record!: BoardGameNightGameDesignerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

