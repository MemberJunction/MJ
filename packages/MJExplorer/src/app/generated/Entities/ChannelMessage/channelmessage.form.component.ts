import { Component } from '@angular/core';
import { ChannelMessageEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChannelMessageDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Channel Messages') // Tell MemberJunction about this class
@Component({
    selector: 'gen-channelmessage-form',
    templateUrl: './channelmessage.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChannelMessageFormComponent extends BaseFormComponent {
    public record!: ChannelMessageEntity;
} 

export function LoadChannelMessageFormComponent() {
    LoadChannelMessageDetailsComponent();
}
