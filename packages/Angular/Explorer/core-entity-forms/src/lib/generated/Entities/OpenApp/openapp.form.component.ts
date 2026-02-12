import { Component } from '@angular/core';
import { OpenAppEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Open Apps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-openapp-form',
    templateUrl: './openapp.form.component.html'
})
export class OpenAppFormComponent extends BaseFormComponent {
    public record!: OpenAppEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'appIdentification', sectionName: 'App Identification', isExpanded: true },
            { sectionKey: 'publisherInformation', sectionName: 'Publisher Information', isExpanded: true },
            { sectionKey: 'sourceRepository', sectionName: 'Source Repository', isExpanded: false },
            { sectionKey: 'installationMetadata', sectionName: 'Installation Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJOpenAppDependencies', sectionName: 'MJ: Open App Dependencies', isExpanded: false },
            { sectionKey: 'mJOpenAppDependencies1', sectionName: 'MJ: Open App Dependencies', isExpanded: false },
            { sectionKey: 'mJOpenAppInstallHistories', sectionName: 'MJ: Open App Install Histories', isExpanded: false }
        ]);
    }
}

