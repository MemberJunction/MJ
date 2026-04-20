import { Component } from '@angular/core';
import { AssociationDemoPostTagEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Post Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoposttag-form',
    templateUrl: './associationdemoposttag.form.component.html'
})
export class AssociationDemoPostTagFormComponent extends BaseFormComponent {
    public record!: AssociationDemoPostTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagInformation', sectionName: 'Tag Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

