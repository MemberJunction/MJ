import { Component } from '@angular/core';
import { MJAIModelPersonaEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Model Personas') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodelpersona-form',
    templateUrl: './mjaimodelpersona.form.component.html'
})
export class MJAIModelPersonaFormComponent extends BaseFormComponent {
    public record!: MJAIModelPersonaEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelConfiguration', sectionName: 'Model Configuration', isExpanded: true },
            { sectionKey: 'personaSettings', sectionName: 'Persona Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

