import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

export function LoadNotificationsResource() {
    const test = new NotificationsResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

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
