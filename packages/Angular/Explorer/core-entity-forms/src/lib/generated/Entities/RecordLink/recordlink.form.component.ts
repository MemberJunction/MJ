import { Component } from '@angular/core';
import { RecordLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRecordLinkDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Record Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recordlink-form',
    templateUrl: './recordlink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecordLinkFormComponent extends BaseFormComponent {
    public record!: RecordLinkEntity;
} 

export function LoadRecordLinkFormComponent() {
    LoadRecordLinkDetailsComponent();
}
