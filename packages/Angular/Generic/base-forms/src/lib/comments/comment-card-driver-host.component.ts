import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ComponentRef,
    EventEmitter,
    HostBinding,
    Input,
    OnChanges,
    OnDestroy,
    Output,
    Type,
    ViewChild,
    ViewContainerRef,
    ViewEncapsulation,
    inject
} from '@angular/core';
import { BaseEntity } from '@memberjunction/core';
import { MJCommentEntity, MJConversationEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { EntitySubtypeUIDriverBase } from '../subtype-ui-driver/entity-subtype-ui-driver';
import { FormNavigationEvent } from '../types/navigation-events';
import { FormRecordCommentsCoordinatorService } from './form-record-comments-coordinator.service';

/**
 * Strongly-typed context passed via `DriverContext` to {@link EntitySubtypeUIDriverBase}
 * instances mounted inside `<mj-record-comments>` (`Surface = 'comment-card'`).
 */
export interface CommentCardDriverContext extends Record<string, unknown> {
    Coordinator: FormRecordCommentsCoordinatorService | null;
    Conversation: MJConversationEntity;
    AnchorBadgeLabel: string;
    CurrentLiveValue: string | null;
    CanUserUpdateTargetField: boolean;
    CanUserDiscuss: boolean;
    OnDiscuss: () => void;
    OnError: (message: string) => void;
}

/**
 * Dynamic host component that mounts a registered {@link EntitySubtypeUIDriverBase}
 * subclass (`@RegisterClass(EntitySubtypeUIDriverBase, UIDriverClass)`) for a comment
 * subtype card inside `<mj-record-comments>`.
 */
@Component({
    standalone: false,
    selector: 'mj-comment-card-driver-host',
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    template: `<ng-container #cardHost></ng-container>`
})
export class MjCommentCardDriverHostComponent extends BaseAngularComponent implements OnChanges, OnDestroy {
    @HostBinding('style.display')
    public readonly HostDisplay = 'contents';

    private readonly cdr = inject(ChangeDetectorRef);

    private mountedRef: ComponentRef<EntitySubtypeUIDriverBase> | null = null;
    private mountedKey: string | null = null;

    @ViewChild('cardHost', { read: ViewContainerRef, static: true })
    private cardHost!: ViewContainerRef;

    /** Registration key (`MJ: Comment Types.UIDriverClass`) in `MJGlobal.Instance.ClassFactory`. */
    @Input() UIDriverKey: string | null = null;

    /** The `MJ: Comments` record (or null when mocked in tests). */
    @Input() CommentRecord: MJCommentEntity | null = null;

    /** The subtype IS-A child record (e.g., `MJFieldSuggestionEntity`). */
    @Input() ChildRecord: BaseEntity | null = null;

    /** The target entity record that the comment is anchored to. */
    @Input() TargetRecord: BaseEntity | null = null;

    /** Whether the host form is currently in edit mode. */
    @Input() EditMode = false;

    /** Structured card context (coordinator, discussion callback, error callback). */
    @Input() DriverContext: CommentCardDriverContext | null = null;

    @Output() Navigate = new EventEmitter<FormNavigationEvent>();
    @Output() RecordMutated = new EventEmitter<void>();

    public ngOnChanges(): void {
        this.syncMountedDriver();
    }

    public ngOnDestroy(): void {
        this.destroyMountedDriver();
    }

    private syncMountedDriver(): void {
        const key = this.UIDriverKey?.trim() || null;
        if (!key || !this.cardHost) {
            this.destroyMountedDriver();
            return;
        }

        if (this.mountedRef && this.mountedKey === key) {
            this.pushInputs();
            return;
        }

        this.destroyMountedDriver();
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(EntitySubtypeUIDriverBase, key);
        if (!reg?.SubClass) {
            return;
        }

        const componentType = reg.SubClass as Type<EntitySubtypeUIDriverBase>;
        const ref = this.cardHost.createComponent(componentType);
        this.mountedRef = ref;
        this.mountedKey = key;

        const navSub = ref.instance.Navigate.subscribe((evt: FormNavigationEvent) => this.Navigate.emit(evt));
        const mutSub = ref.instance.RecordMutated.subscribe(() => {
            this.RecordMutated.emit();
            this.cdr.markForCheck();
        });
        ref.onDestroy(() => {
            navSub.unsubscribe();
            mutSub.unsubscribe();
        });

        this.pushInputs();
    }

    private pushInputs(): void {
        if (!this.mountedRef) return;
        const inst = this.mountedRef.instance;
        inst.Provider = this.Provider;
        inst.Record = this.CommentRecord;
        inst.ChildRecord = this.ChildRecord;
        inst.TargetRecord = this.TargetRecord;
        inst.EditMode = this.EditMode;
        inst.Surface = 'comment-card';
        inst.DriverContext = this.DriverContext;
        this.mountedRef.changeDetectorRef.markForCheck();
    }

    private destroyMountedDriver(): void {
        if (this.mountedRef) {
            this.mountedRef.destroy();
            this.mountedRef = null;
            this.mountedKey = null;
        }
        this.cardHost?.clear();
    }
}
