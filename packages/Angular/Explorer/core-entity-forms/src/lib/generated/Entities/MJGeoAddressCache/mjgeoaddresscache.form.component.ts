import { Component } from '@angular/core';
import { MJGeoAddressCacheEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Geo Address Caches') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgeoaddresscache-form',
    templateUrl: './mjgeoaddresscache.form.component.html'
})
export class MJGeoAddressCacheFormComponent extends BaseFormComponent {
    public record!: MJGeoAddressCacheEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'cacheIdentification', sectionName: 'Cache Identification', isExpanded: true },
            { sectionKey: 'geocodingResults', sectionName: 'Geocoding Results', isExpanded: true },
            { sectionKey: 'cacheLifecycle', sectionName: 'Cache Lifecycle', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

