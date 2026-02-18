import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { UserInfo, RunView } from '@memberjunction/core';
import { MJUserEntity } from '@memberjunction/core-entities';

export interface UserSearchResult {
    id: string;
    name: string;
    email: string;
    firstName: string;
    lastName: string;
}

@Component({
    selector: 'mj-user-picker',
    standalone: true,
    imports: [FormsModule],
    template: `
        <div class="user-picker">
            <div class="search-input-wrapper">
                <input
                    type="text"
                    class="user-search-input"
                    [(ngModel)]="searchQuery"
                    [placeholder]="placeholder"
                    (keydown.enter)="onSearch()"
                    [disabled]="isSearching"
                />
                <button class="search-button" (click)="onSearch()" [disabled]="isSearching">
                    @if (isSearching) {
                        <i class="fa-solid fa-spinner fa-spin"></i>
                    } @else {
                        <i class="fa-solid fa-search"></i>
                    }
                </button>
            </div>

            @if (showResults && searchResults.length > 0) {
                <div class="search-results-dropdown">
                    @for (user of searchResults; track user.id) {
                        <div class="user-search-item" (click)="onSelectUser(user)">
                            <div class="user-avatar">
                                <i class="fa-solid fa-user"></i>
                            </div>
                            <div class="user-info">
                                <div class="user-name">{{ user.name }}</div>
                                <div class="user-email">{{ user.email }}</div>
                            </div>
                        </div>
                    }
                </div>
            }

            @if (showResults && searchResults.length === 0 && searchQuery.length >= 2 && !isSearching) {
                <div class="search-results-dropdown">
                    <div class="no-results">
                        <i class="fa-solid fa-user-slash"></i>
                        <span>No users found</span>
                    </div>
                </div>
            }
        </div>
    `,
    styles: [`
        .user-picker {
            width: 100%;
            position: relative;
        }

        .search-input-wrapper {
            display: flex;
            gap: 8px;
            width: 100%;
        }

        .user-search-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s;
        }

        .user-search-input:focus {
            border-color: #6366F1;
        }

        .user-search-input:disabled {
            background: #F3F4F6;
            cursor: not-allowed;
        }

        .search-button {
            padding: 8px 16px;
            background: #6366F1;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }

        .search-button:hover:not(:disabled) {
            background: #5558E3;
        }

        .search-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .search-button i {
            font-size: 14px;
        }

        .search-results-dropdown {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            max-height: 300px;
            overflow-y: auto;
            z-index: 1000;
        }

        .user-search-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            cursor: pointer;
            transition: background 0.15s;
        }

        .user-search-item:hover {
            background-color: #F3F4F6;
        }

        .user-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 16px;
            flex-shrink: 0;
        }

        .user-info {
            flex: 1;
            min-width: 0;
        }

        .user-name {
            font-size: 14px;
            font-weight: 500;
            color: #1F2937;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .user-email {
            font-size: 12px;
            color: #6B7280;
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .no-results {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            padding: 24px;
            color: #9CA3AF;
        }

        .no-results i {
            font-size: 32px;
        }

        .no-results span {
            font-size: 14px;
        }
    `]
})
export class UserPickerComponent implements OnInit, OnDestroy {
    @Input() currentUser!: UserInfo;
    @Input() excludeUserIds: string[] = [];
    @Input() placeholder: string = 'Search for a user (press Enter)...';

    @Output() userSelected = new EventEmitter<UserSearchResult>();

    searchQuery: string = '';
    searchResults: UserSearchResult[] = [];
    isSearching: boolean = false;
    showResults: boolean = false;

    ngOnInit(): void {
        // Add click outside listener to close dropdown
        document.addEventListener('click', this.handleClickOutside.bind(this));
    }

    ngOnDestroy(): void {
        document.removeEventListener('click', this.handleClickOutside.bind(this));
    }

    private handleClickOutside(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (!target.closest('.user-picker')) {
            this.showResults = false;
        }
    }

    onSearch(): void {
        if (!this.searchQuery || this.searchQuery.trim().length < 2) {
            this.showResults = false;
            return;
        }

        this.performSearch(this.searchQuery.trim());
    }

    onSelectUser(user: UserSearchResult): void {
        this.userSelected.emit(user);
        this.searchQuery = '';
        this.searchResults = [];
        this.showResults = false;
    }

    private async performSearch(query: string): Promise<void> {
        if (!query || query.length < 2) {
            this.searchResults = [];
            this.showResults = false;
            return;
        }

        this.isSearching = true;
        this.showResults = true;

        try {
            const rv = new RunView();

            // Escape single quotes in query to prevent SQL errors
            const escapedQuery = query.replace(/'/g, "''");

            // Build exclude filter
            let excludeFilter = '';
            if (this.excludeUserIds.length > 0) {
                const ids = this.excludeUserIds.map(id => `'${id}'`).join(',');
                excludeFilter = ` AND ID NOT IN (${ids})`;
            }

            // Search in Name, Email, FirstName, and LastName (case-insensitive)
            const searchFilter = `(
                Name LIKE '%${escapedQuery}%' OR
                Email LIKE '%${escapedQuery}%' OR
                FirstName LIKE '%${escapedQuery}%' OR
                LastName LIKE '%${escapedQuery}%'
            )${excludeFilter}`;

            const result = await rv.RunView<MJUserEntity>({
                EntityName: 'MJ: Users',
                ExtraFilter: searchFilter,
                OrderBy: 'Name ASC',
                MaxRows: 20,
                ResultType: 'entity_object'
            }, this.currentUser);

            console.log('User search result:', {
                query,
                success: result.Success,
                count: result.Results?.length,
                error: result.ErrorMessage
            });

            if (result.Success && result.Results) {
                this.searchResults = result.Results.map(user => ({
                    id: user.ID,
                    name: user.Name,
                    email: user.Email,
                    firstName: user.FirstName || '',
                    lastName: user.LastName || ''
                }));
            } else {
                console.warn('User search returned no results or failed:', result.ErrorMessage);
                this.searchResults = [];
            }
        } catch (error) {
            console.error('Error searching users:', error);
            this.searchResults = [];
        } finally {
            this.isSearching = false;
        }
    }
}
