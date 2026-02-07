import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
@RegisterClass(BaseResourceComponent, 'NotificationsResource')
@Component({
  standalone: false,
    selector: 'mj-notifications-resource',
    template: `<app-user-notifications></app-user-notifications>`
})
export class NotificationsResource extends BaseResourceComponent implements OnInit {
    ngOnInit(): void {

    }
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Notifications';
    }
    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-bell';
    }
}
