import { Component } from '@angular/core';
import { hubspotmedia_bridgeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Media Bridges') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotmedia_bridge-form',
    templateUrl: './hubspotmedia_bridge.form.component.html'
})
export class hubspotmedia_bridgeFormComponent extends BaseFormComponent {
    public record!: hubspotmedia_bridgeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mediaContent', sectionName: 'Media Content', isExpanded: true },
            { sectionKey: 'mediaDetails', sectionName: 'Media Details', isExpanded: true },
            { sectionKey: 'providerInformation', sectionName: 'Provider Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

