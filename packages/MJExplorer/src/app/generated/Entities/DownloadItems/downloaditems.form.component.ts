import { Component } from '@angular/core';
import { DownloadItemsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDownloadItemsDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Download Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-downloaditems-form',
    templateUrl: './downloaditems.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DownloadItemsFormComponent extends BaseFormComponent {
    public record!: DownloadItemsEntity;
} 

export function LoadDownloadItemsFormComponent() {
    LoadDownloadItemsDetailsComponent();
}
