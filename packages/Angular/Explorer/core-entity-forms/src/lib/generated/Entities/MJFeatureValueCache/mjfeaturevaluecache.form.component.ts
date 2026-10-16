import { Component } from '@angular/core';
import { MJFeatureValueCacheEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Feature Value Caches') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfeaturevaluecache-form',
    templateUrl: './mjfeaturevaluecache.form.component.html'
})
export class MJFeatureValueCacheFormComponent extends BaseFormComponent {
    public record!: MJFeatureValueCacheEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'executionContext', sectionName: 'Execution Context', isExpanded: true },
            { sectionKey: 'hashFingerprints', sectionName: 'Hash Fingerprints', isExpanded: true },
            { sectionKey: 'cacheData', sectionName: 'Cache Data', isExpanded: true },
            { sectionKey: 'performanceMetrics', sectionName: 'Performance Metrics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJFeatureValues', sectionName: 'Feature Values', isExpanded: false }
        ]);
    }
}

