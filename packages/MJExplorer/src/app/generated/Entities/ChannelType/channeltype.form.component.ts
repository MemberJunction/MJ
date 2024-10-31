import { Component } from '@angular/core';
import { ChannelTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChannelTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Channel Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-channeltype-form',
    templateUrl: './channeltype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChannelTypeFormComponent extends BaseFormComponent {
    public record!: ChannelTypeEntity;
} 

export function LoadChannelTypeFormComponent() {
    LoadChannelTypeDetailsComponent();
}
