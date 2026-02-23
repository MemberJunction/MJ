import { Component } from '@angular/core';
import { MJAIArchitecturesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Architectures') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiarchitectures-form',
    templateUrl: './mjaiarchitectures.form.component.html'
})
export class MJAIArchitecturesFormComponent extends BaseFormComponent {
    public record!: MJAIArchitecturesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreArchitecture', sectionName: 'Core Architecture', isExpanded: true },
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'publicationReferences', sectionName: 'Publication & References', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIArchitectures', sectionName: 'MJ: AI Architectures', isExpanded: false },
            { sectionKey: 'mJAIModelArchitectures', sectionName: 'MJ: AI Model Architectures', isExpanded: false }
        ]);
    }
}

