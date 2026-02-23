import { Component } from '@angular/core';
import { MJVersionLabelItemsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Version Label Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjversionlabelitems-form',
    templateUrl: './mjversionlabelitems.form.component.html'
})
export class MJVersionLabelItemsFormComponent extends BaseFormComponent {
    public record!: MJVersionLabelItemsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'versionMapping', sectionName: 'Version Mapping', isExpanded: true },
            { sectionKey: 'displayNames', sectionName: 'Display Names', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

