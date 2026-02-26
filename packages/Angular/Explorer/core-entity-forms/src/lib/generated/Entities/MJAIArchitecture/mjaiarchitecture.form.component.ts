import { Component } from '@angular/core';
import { MJAIArchitectureEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Architectures') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiarchitecture-form',
    templateUrl: './mjaiarchitecture.form.component.html'
})
export class MJAIArchitectureFormComponent extends BaseFormComponent {
    public record!: MJAIArchitectureEntity;

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

