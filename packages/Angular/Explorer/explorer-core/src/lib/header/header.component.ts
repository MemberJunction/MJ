import { Component, EventEmitter, Output, ViewChild, ElementRef, OnInit, Input, HostListener } from '@angular/core';
import { take, firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';

import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { EntityInfo, Metadata, RunView } from '@memberjunction/core';
import { DropDownListComponent } from '@progress/kendo-angular-dropdowns';
import { UserNotificationEntity } from '@memberjunction/core-entities';
import { UserAvatarService } from '@memberjunction/ng-user-avatar';

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
    public userIconClass: string | null = null;
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

    constructor(
        private authBase: MJAuthBase,
        public sharedService: SharedService,
        private router: Router,
        private userAvatarService: UserAvatarService
    ) {}

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
                const currentUserInfo = md.CurrentUser;
                this.userName = currentUserInfo.FirstLast; // Store user name for display

                // Load the full UserEntity to access avatar fields
                const currentUserEntity = await md.GetEntityObject<any>('Users');
                await currentUserEntity.Load(currentUserInfo.ID);

                // Auto-sync avatar from auth provider if user has no avatar settings in DB
                if (!currentUserEntity.UserImageURL && !currentUserEntity.UserImageIconClass) {
                    const synced = await this.syncAvatarFromAuthProvider(currentUserEntity);
                    if (synced) {
                        // Reload user entity to get saved values
                        await currentUserEntity.Load(currentUserInfo.ID);
                    }
                }

                // Load avatar for display (always from DB after potential sync)
                this.loadUserAvatar(currentUserEntity);

                // Listen for avatar updates from settings page
                MJGlobal.Instance.GetEventListener(false).subscribe((updateEvent) => {
                    if (updateEvent.eventCode === EventCodes.AvatarUpdated) {
                        // Reload the user entity to get updated avatar
                        md.GetEntityObject<any>('Users').then(async (userEntity) => {
                            await userEntity.Load(currentUserInfo.ID);
                            this.loadUserAvatar(userEntity);
                        });
                    }
                });
            }
        });
    }

    /**
     * Syncs avatar from auth provider (Microsoft, Google, etc.)
     * Gets the image URL and auth headers based on provider type
     */
    private async syncAvatarFromAuthProvider(user: any): Promise<boolean> {
        try {
            const claims = await firstValueFrom(await this.authBase.getUserClaims());

            // Check if Microsoft
            if (claims && claims.authority &&
                (claims.authority.includes('microsoftonline.com') || claims.authority.includes('microsoft.com'))) {
                // Microsoft Graph API photo endpoint
                const imageUrl = 'https://graph.microsoft.com/v1.0/me/photo/$value';
                const authHeaders = { 'Authorization': `Bearer ${claims.accessToken}` };

                return await this.userAvatarService.syncFromImageUrl(user, imageUrl, authHeaders);
            }

            // TODO: Add support for other providers (Google, Auth0, etc.)
            // if (isGoogle(claims)) {
            //   const imageUrl = claims.picture; // Google provides picture URL directly
            //   return await this.userAvatarService.syncFromImageUrl(user, imageUrl);
            // }

            return false;
        } catch (error) {
            console.warn('Could not sync avatar from auth provider:', error);
            return false;
        }
    }

    /**
     * Loads the user avatar for display in the header
     * Priority: UserImageURL > UserImageIconClass > default
     */
    private loadUserAvatar(user: any): void {
        // Check for image URL first
        if (user.UserImageURL) {
            this.userImageURL = user.UserImageURL;
            this.userIconClass = null;
            this.sharedService.CurrentUserImage = user.UserImageURL;
        }
        // Then check for icon class
        else if (user.UserImageIconClass) {
            this.userIconClass = user.UserImageIconClass;
            this.userImageURL = ''; // Clear image URL so kendo-avatar doesn't show placeholder
        }
        // Default fallback
        else {
            this.userImageURL = 'assets/user.png';
            this.userIconClass = null;
        }
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