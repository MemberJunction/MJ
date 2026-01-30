import { Component } from '@angular/core';
import { OAuthAuthServerMetadataCacheEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Auth Server Metadata Caches') // Tell MemberJunction about this class
@Component({
    selector: 'gen-oauthauthservermetadatacache-form',
    templateUrl: './oauthauthservermetadatacache.form.component.html'
})
export class OAuthAuthServerMetadataCacheFormComponent extends BaseFormComponent {
    public record!: OAuthAuthServerMetadataCacheEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'endpointURLs', sectionName: 'Endpoint URLs', isExpanded: true },
            { sectionKey: 'supportedFeatures', sectionName: 'Supported Features', isExpanded: true },
            { sectionKey: 'cacheData', sectionName: 'Cache Data', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadOAuthAuthServerMetadataCacheFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
