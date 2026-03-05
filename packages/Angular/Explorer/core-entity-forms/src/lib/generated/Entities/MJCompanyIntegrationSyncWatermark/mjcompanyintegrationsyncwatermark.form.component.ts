import { Component } from '@angular/core';
import { MJCompanyIntegrationSyncWatermarkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Company Integration Sync Watermarks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompanyintegrationsyncwatermark-form',
    templateUrl: './mjcompanyintegrationsyncwatermark.form.component.html'
})
export class MJCompanyIntegrationSyncWatermarkFormComponent extends BaseFormComponent {
    public record!: MJCompanyIntegrationSyncWatermarkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'syncConfiguration', sectionName: 'Sync Configuration', isExpanded: true },
            { sectionKey: 'syncProgress', sectionName: 'Sync Progress', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

