import { Component } from '@angular/core';
import { ListShareEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: List Shares') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-listshare-form',
    templateUrl: './listshare.form.component.html'
})
export class ListShareFormComponent extends BaseFormComponent {
    public record!: ListShareEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'shareDetails', sectionName: 'Share Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

