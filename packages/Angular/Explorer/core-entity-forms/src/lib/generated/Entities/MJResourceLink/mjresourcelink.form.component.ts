import { Component } from '@angular/core';
import { MJResourceLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Resource Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjresourcelink-form',
    templateUrl: './mjresourcelink.form.component.html'
})
export class MJResourceLinkFormComponent extends BaseFormComponent {
    public record!: MJResourceLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

