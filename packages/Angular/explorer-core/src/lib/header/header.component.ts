import { Component, EventEmitter, Output, ViewChild, ElementRef, OnInit, Input } from '@angular/core';
import { Router } from '@angular/router';

import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { Metadata, RunView } from '@memberjunction/core';
import { DropDownListComponent } from '@progress/kendo-angular-dropdowns';
import { MSFTUserImageService } from './MSFT_UserImageService';
import { UserNotificationEntity } from '@memberjunction/core-entities';

@Component({
    selector: 'app-header-component',
    templateUrl: './header.component.html',
    styleUrls: ['header.component.css']
})
export class HeaderComponent implements OnInit {
    @Input() applicationName!: string;
    @Input() applicationInstance!: string;

    public menuItems: Array<string> = [
        'User Name', 'Logout'
    ];
    public selectedMenuItem: string = 'User Name';
    public userImageURL: string = 'assets/user.png';
    @Output() public toggle = new EventEmitter();

    @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>
    @ViewChild(DropDownListComponent) entityDropdown!: DropDownListComponent

    public appName: string='';

    public selectedLanguage = { locale: 'English', localeId: 'en-US' };
    public popupSettings = { width: '150' };
    public themes: any = [
        {
            href: 'assets/kendo-theme-default/dist/all.css',
            text: 'Default'
        }
    ];
    public selectedTheme = this.themes[0];

    public get UserNotifications(): UserNotificationEntity[] {
        return SharedService.UserNotifications;
    }

    public get UnreadNotificationCount(): number {
        return SharedService.UnreadUserNotificationCount;
    }

    constructor(public authBase: MJAuthBase, public sharedService: SharedService, private msftUserImageService: MSFTUserImageService, private router: Router) {}

    public changeTheme(theme: {href: string, text: string}) {
        this.selectedTheme = theme;
        const themeEl: any = document.getElementById('theme');
        themeEl.href = theme.href;
    }

    public onButtonClick(): void {
        this.toggle.emit();
    }

    public async logout() {
        this.authBase.logout();
        localStorage.removeItem('auth')
        localStorage.removeItem('claims')
    }

    public async valueChange(event: any) {
        if(event === 'Logout'){
            this.logout();
        }
    }

    public async showNotifications(event: any) {
        MJGlobal.Instance.RaiseEvent({
            event: MJEventType.ComponentEvent,
            component: this,
            eventCode: EventCodes.ViewNotifications,
            args: {}
        });
        this.router.navigate(['notifications']);
    }


    public searchableEntities: any[] = [];
    public selectedEntity: any;
    public async ngOnInit() {
        this.appName = `${this.applicationName} - ${this.applicationInstance}`;
        MJGlobal.Instance.GetEventListener(true).subscribe(async (event) => {
            if (event.event === MJEventType.LoggedIn) {
                await this.loadSearchableEntities();
                
                const md = new Metadata();
                this.menuItems[0] = md.CurrentUser.FirstLast;
                this.selectedMenuItem = this.menuItems[0];

                if (this.isMicrosoft(event.args))
                    this.msftUserImageService.getPhoto(event.args.accessToken).subscribe((blob: Blob) => {
                        this.userImageURL = URL.createObjectURL(blob);
                        this.sharedService.CurrentUserImage = this.userImageURL;
                    });
            }
        });
    }

    private async loadSearchableEntities() {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'Entities',
            ExtraFilter: 'AllowUserSearchAPI = 1',
            OrderBy: 'Name'
        })
        if (result && result.Success) {
            this.searchableEntities = result.Results;
            if (this.searchableEntities.length > 0) {
                this.selectedEntity = this.searchableEntities[0];
            }
        }
    }

    private isMicrosoft(claims: any): boolean {
        return claims && claims.authority && (claims.authority.includes('microsoftonline.com') || 
                                        claims.authority.includes('microsoft.com'));
    }

    public onSearch(event: any) {
        const inputValue = this.searchInput.nativeElement.value
        if (inputValue && inputValue.length > 0 && inputValue.trim().length > 2 /* at least 3 characters to search*/ ) {
            this.searchInput.nativeElement.value = ''; // blank it out

            this.router.navigate(['resource', 'search', inputValue], { queryParams: { Entity: this.selectedEntity.Name } })
        }
        else {
            this.sharedService.CreateSimpleNotification('Please enter at least 3 characters to search','warning', 1500);
        }
    }
}
