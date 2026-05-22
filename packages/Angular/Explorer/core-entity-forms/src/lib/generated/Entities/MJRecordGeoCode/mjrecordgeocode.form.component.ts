import { Component } from '@angular/core';
import { MJRecordGeoCodeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Record Geo Codes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordgeocode-form',
    templateUrl: './mjrecordgeocode.form.component.html'
})
export class MJRecordGeoCodeFormComponent extends BaseFormComponent {
    public record!: MJRecordGeoCodeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordMapping', sectionName: 'Record Mapping', isExpanded: true },
            { sectionKey: 'geocodingResults', sectionName: 'Geocoding Results', isExpanded: true },
            { sectionKey: 'processingStatus', sectionName: 'Processing Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

