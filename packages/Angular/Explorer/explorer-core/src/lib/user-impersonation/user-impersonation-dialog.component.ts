import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    DestroyRef,
    ElementRef,
    HostListener,
    OnInit,
    ViewChild,
    inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { UUIDsEqual } from '@memberjunction/global';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { MJUserImpersonationService } from './user-impersonation.service';
import type {
    MJImpersonationCandidate,
    MJImpersonationCategory,
    MJImpersonationQuickPreset,
    MJImpersonationState,
} from './user-impersonation.types';

interface ResolvedQuickPreset {
    readonly preset: MJImpersonationQuickPreset;
    readonly candidate: MJImpersonationCandidate;
}

const DEFAULT_DIALOG_TITLE = 'View As User';
const DEFAULT_DIALOG_SUBTITLE =
    "Temporarily view the application with another user's permissions and row-level security scope.";

@Component({
    selector: 'mj-user-impersonation-dialog',
    standalone: true,
    imports: [FormsModule, MJButtonDirective],
    templateUrl: './user-impersonation-dialog.component.html',
    styleUrls: ['./user-impersonation-dialog.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserImpersonationDialogComponent implements OnInit {
    private readonly impersonationService = inject(MJUserImpersonationService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly destroyRef = inject(DestroyRef);

    @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;

    private readonly searchInputSubject = new Subject<string>();

    public IsOpen = false;
    public State: MJImpersonationState = this.impersonationService.CurrentState;
    public Candidates: readonly MJImpersonationCandidate[] = [];
    public TotalCount = 0;
    public Loading = false;
    public SearchTerm = '';
    public SelectedCategoryKey: string | null = null;
    public SwitchingUserId: string | null = null;

    public DialogTitle = DEFAULT_DIALOG_TITLE;
    public DialogSubtitle = DEFAULT_DIALOG_SUBTITLE;
    public Categories: readonly MJImpersonationCategory[] = [];
    public ResolvedQuickPresets: readonly ResolvedQuickPreset[] = [];
    public FilteredCandidates: readonly MJImpersonationCandidate[] = [];

    public ngOnInit(): void {
        this.impersonationService.State$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((state) => {
                this.State = state;
                if (!state.switching) {
                    this.SwitchingUserId = null;
                }
                this.cdr.markForCheck();
            });

        this.impersonationService.DialogOpen$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((open) => {
                this.IsOpen = open;
                if (open) {
                    this.SearchTerm = '';
                    this.SelectedCategoryKey = null;
                    this.syncAdapterMetadata();
                    this.recomputeView();
                    this.focusSearchSoon();
                }
                this.cdr.markForCheck();
            });

        this.impersonationService.Candidates$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((candidates) => {
                this.Candidates = candidates;
                this.syncAdapterMetadata();
                this.recomputeView();
                this.cdr.markForCheck();
            });

        this.impersonationService.TotalCount$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((count) => {
                this.TotalCount = count;
                this.cdr.markForCheck();
            });

        this.impersonationService.LoadingUsers$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((loading) => {
                this.Loading = loading;
                this.cdr.markForCheck();
            });

        this.impersonationService.AdaptersChanged$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.syncAdapterMetadata();
                this.recomputeView();
                this.cdr.markForCheck();
            });

        this.searchInputSubject
            .pipe(
                debounceTime(220),
                distinctUntilChanged(),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe((term) => {
                if (this.IsOpen) {
                    void this.impersonationService.LoadUsers(term, true);
                }
            });
    }

    @HostListener('document:keydown.escape')
    public OnEscapeKey(): void {
        if (this.IsOpen && !this.State.switching) {
            this.Close();
        }
    }

    public OnSearchChanged(value: string): void {
        this.SearchTerm = value;
        this.recomputeView();
        this.searchInputSubject.next(value);
        this.cdr.markForCheck();
    }

    public ClearSearch(): void {
        this.OnSearchChanged('');
        this.focusSearchSoon();
    }

    public SelectCategory(categoryKey: string | null): void {
        this.SelectedCategoryKey = categoryKey;
        this.recomputeView();
        this.cdr.markForCheck();
    }

    public Close(): void {
        if (this.State.switching) {
            return;
        }
        this.impersonationService.CloseDialog();
    }

    public OnBackdropClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.Close();
        }
    }

    public async SelectCandidate(candidate: MJImpersonationCandidate): Promise<void> {
        if (this.State.switching || this.IsActiveCandidate(candidate)) {
            return;
        }
        this.SwitchingUserId = candidate.userId;
        this.cdr.markForCheck();
        await this.impersonationService.StartImpersonation(candidate.userId);
    }

    public async ExitImpersonation(): Promise<void> {
        if (this.State.switching) {
            return;
        }
        await this.impersonationService.ExitImpersonation();
    }

    public IsActiveCandidate(candidate: MJImpersonationCandidate): boolean {
        return Boolean(
            this.State.activeTarget &&
                UUIDsEqual(this.State.activeTarget.userId, candidate.userId)
        );
    }

    public GetInitials(candidate: MJImpersonationCandidate): string {
        const parts = candidate.name.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
        }
        const source = parts[0] || candidate.email || '?';
        return source.slice(0, 2).toUpperCase();
    }

    private focusSearchSoon(): void {
        setTimeout(() => {
            this.searchInputRef?.nativeElement?.focus();
        }, 0);
    }

    private syncAdapterMetadata(): void {
        const activeAdapters = this.impersonationService.GetActiveAdapters();
        let title = DEFAULT_DIALOG_TITLE;
        let subtitle = DEFAULT_DIALOG_SUBTITLE;
        const categoryMap = new Map<string, MJImpersonationCategory>();
        const presets: MJImpersonationQuickPreset[] = [];

        for (const adapter of activeAdapters) {
            if (adapter.title) {
                title = adapter.title;
            }
            if (adapter.subtitle) {
                subtitle = adapter.subtitle;
            }
            for (const cat of adapter.categories ?? []) {
                categoryMap.set(cat.key, cat);
            }
            for (const preset of adapter.quickPresets ?? []) {
                presets.push(preset);
            }
        }

        this.DialogTitle = title;
        this.DialogSubtitle = subtitle;
        this.Categories = Array.from(categoryMap.values());

        const resolved: ResolvedQuickPreset[] = [];
        for (const preset of presets) {
            try {
                const candidate = preset.resolveCandidate(this.Candidates);
                if (candidate) {
                    resolved.push({ preset, candidate });
                }
            } catch {
                // Ignore faulty adapter preset resolvers
            }
        }
        this.ResolvedQuickPresets = resolved;
    }

    private recomputeView(): void {
        const term = this.SearchTerm.trim().toLowerCase();
        const categoryKey = this.SelectedCategoryKey;

        this.FilteredCandidates = this.Candidates.filter((candidate) => {
            if (categoryKey && candidate.categoryKey !== categoryKey) {
                return false;
            }
            if (!term) {
                return true;
            }
            const badgeLabels = (candidate.badges ?? []).map((b) => b.label);
            const haystacks = [
                candidate.name,
                candidate.firstName ?? '',
                candidate.lastName ?? '',
                candidate.email,
                candidate.title ?? '',
                candidate.organization ?? '',
                candidate.subtitle ?? '',
                ...candidate.roleNames,
                ...badgeLabels,
            ];
            return haystacks.some((value) => value.toLowerCase().includes(term));
        });
    }
}
