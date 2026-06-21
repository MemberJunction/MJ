import { Component } from '@angular/core';
import { MJRecordProcessWatermarkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Record Process Watermarks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordprocesswatermark-form',
    templateUrl: './mjrecordprocesswatermark.form.component.html'
})
export class MJRecordProcessWatermarkFormComponent extends BaseFormComponent {
    public record!: MJRecordProcessWatermarkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'processTracking', sectionName: 'Process Tracking', isExpanded: true },
            { sectionKey: 'checksumData', sectionName: 'Checksum Data', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

