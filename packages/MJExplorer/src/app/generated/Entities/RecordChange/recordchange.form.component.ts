import { Component } from '@angular/core';
import { RecordChangeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadRecordChangeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Record Changes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recordchange-form',
    templateUrl: './recordchange.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecordChangeFormComponent extends BaseFormComponent {
    public record: RecordChangeEntity | null = null;
} 

export function LoadRecordChangeFormComponent() {
    LoadRecordChangeDetailsComponent();
}
