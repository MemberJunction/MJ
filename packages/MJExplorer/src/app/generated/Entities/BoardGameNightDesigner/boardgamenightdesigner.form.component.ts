import { Component } from '@angular/core';
import { BoardGameNightDesignerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Designers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-boardgamenightdesigner-form',
    templateUrl: './boardgamenightdesigner.form.component.html'
})
export class BoardGameNightDesignerFormComponent extends BaseFormComponent {
    public record!: BoardGameNightDesignerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'designerProfile', sectionName: 'Designer Profile', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'gameDesigners', sectionName: 'Game Designers', isExpanded: false }
        ]);
    }
}

