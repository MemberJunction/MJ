import { Component } from '@angular/core';
import { IzzyAIConfigurationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Izzy AI Configurations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-izzyaiconfiguration-form',
    templateUrl: './izzyaiconfiguration.form.component.html'
})
export class IzzyAIConfigurationFormComponent extends BaseFormComponent {
    public record!: IzzyAIConfigurationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'channels', sectionName: 'Channels', isExpanded: false },
            { sectionKey: 'organizations', sectionName: 'Organizations', isExpanded: false }
        ]);
    }
}

export function LoadIzzyAIConfigurationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
