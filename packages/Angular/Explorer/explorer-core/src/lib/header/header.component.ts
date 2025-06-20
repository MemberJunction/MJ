import { Component, EventEmitter, Output, ViewChild, ElementRef, OnInit, Input, HostListener } from '@angular/core';
import { take, firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';

import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { EntityInfo, Metadata, RunView } from '@memberjunction/core';
import { DropDownListComponent } from '@progress/kendo-angular-dropdowns';
import { MSFTUserImageService } from './MSFT_UserImageService';
import { UserNotificationEntity } from '@memberjunction/core-entities';

@Component({
    selector: 'mj-header-component',
    templateUrl: './header.component.html',
    styleUrls: ['header.component.css']
})
export class HeaderComponent implements OnInit {
    @Input() applicationName!: string;
    @Input() applicationInstance!: string;

    public menuItems: Array<string> = [];
    public selectedMenuItem: string = '';
    public userImageURL: string = 'assets/user.png';
    @Output() public toggle = new EventEmitter();

    @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>
    @ViewChild(DropDownListComponent) entityDropdown!: DropDownListComponent

    public appName: string='';
    public isSearchOpen: boolean = false; // Track search popup state
    public isUserMenuOpen: boolean = false; // Track user menu state
    public userName: string = ''; // Store user name

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

    // Listen for clicks outside the search area and user menu to close them
    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        const searchWrapper = document.querySelector('.search-wrapper');
        const searchToggle = document.querySelector('.search-toggle-icon');
        const userDropdown = document.querySelector('.user-dropdown-wrapper');
        
        // Close search popup if clicking outside
        if (this.isSearchOpen && searchWrapper && searchToggle) {
            if (!searchWrapper.contains(target) && !searchToggle.contains(target)) {
                this.isSearchOpen = false;
            }
        }
        
        // Close user menu if clicking outside
        if (this.isUserMenuOpen && userDropdown) {
            if (!userDropdown.contains(target)) {
                this.isUserMenuOpen = false;
            }
        }
    }

    // Toggle search popup visibility
    public toggleSearch(): void {
        this.isSearchOpen = !this.isSearchOpen;
        
        // Focus on search input when opened
        if (this.isSearchOpen) {
            setTimeout(() => {
                if (this.searchInput && this.searchInput.nativeElement) {
                    this.searchInput.nativeElement.focus();
                }
            }, 100);
        }
    }

    // Toggle user menu dropdown
    public toggleUserMenu(): void {
        this.isUserMenuOpen = !this.isUserMenuOpen;
    }

    public changeTheme(theme: {href: string, text: string}) {
        this.selectedTheme = theme;
        const themeEl: any = document.getElementById('theme');
        themeEl.href = theme.href;
    }

    public onButtonClick(): void {
        this.toggle.emit();
    }

    public async logout() {
        this.isUserMenuOpen = false; // Close the menu
        this.authBase.logout();
        localStorage.removeItem('auth')
        localStorage.removeItem('claims')
    }

    public async valueChange(event: any) {
        // This method is no longer needed since we're using custom dropdown
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
                this.userName = md.CurrentUser.FirstLast; // Store user name for display

                const claims$ = (await this.authBase.getUserClaims()).pipe(take(1));
                const claims = await firstValueFrom(claims$);

                if (this.isMicrosoft(claims)) {
                  this.msftUserImageService.getPhoto(claims.accessToken).subscribe((blob: Blob) => {
                    this.userImageURL = URL.createObjectURL(blob);
                    this.sharedService.CurrentUserImage = this.userImageURL;
                  });
                }
            }
        });
    }

    private async loadSearchableEntities() {
        const md = new Metadata();
        this.searchableEntities = md.Entities.filter((e) => e.AllowUserSearchAPI).sort((a, b) => a.Name.localeCompare(b.Name));
        if (this.searchableEntities.length > 0)
            this.selectedEntity = this.searchableEntities[0];
    }

    private isMicrosoft(claims: any): boolean {
        return claims && claims.authority && (claims.authority.includes('microsoftonline.com') ||
                                        claims.authority.includes('microsoft.com'));
    }

    public onSearch(event: any) {
        const inputValue = this.searchInput.nativeElement.value
        if (inputValue && inputValue.length > 0 && inputValue.trim().length > 2 /* at least 3 characters to search*/ ) {
            this.searchInput.nativeElement.value = ''; // blank it out
            this.isSearchOpen = false; // Close search popup after search

            this.router.navigate(['resource', 'search', inputValue], { queryParams: { Entity: this.selectedEntity.Name } })
        }
        else {
            this.sharedService.CreateSimpleNotification('Please enter at least 3 characters to search','warning', 1500);
        }
    }
}