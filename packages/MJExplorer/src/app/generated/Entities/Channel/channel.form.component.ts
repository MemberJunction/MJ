import { Component } from '@angular/core';
import { ChannelEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChannelDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Channels') // Tell MemberJunction about this class
@Component({
    selector: 'gen-channel-form',
    templateUrl: './channel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChannelFormComponent extends BaseFormComponent {
    public record!: ChannelEntity;
} 

export function LoadChannelFormComponent() {
    LoadChannelDetailsComponent();
}
