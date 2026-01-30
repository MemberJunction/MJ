import { Component } from '@angular/core';
import { VersionLabelItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Version Label Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-versionlabelitem-form',
    templateUrl: './versionlabelitem.form.component.html'
})
export class VersionLabelItemFormComponent extends BaseFormComponent {
    public record!: VersionLabelItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'versionLabelItem', sectionName: 'Version Label Item', isExpanded: true },
            { sectionKey: 'recordSnapshot', sectionName: 'Record Snapshot', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadVersionLabelItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
