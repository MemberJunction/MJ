import { Component, ViewEncapsulation, ChangeDetectorRef } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { TabService } from '@memberjunction/ng-base-application';

/**
 * "Shared With Me" tab for the Lists app (mockup 17). Thin shell around
 * the generic `mj-lists-shared-with-me` component — handles routing the
 * `OpenList` event into the explorer's tab system. The generic component
 * stays framework-agnostic by design (no Router import).
 */
@RegisterClass(BaseResourceComponent, 'ListsSharedWithMeResource')
@Component({
  standalone: false,
  selector: 'mj-lists-shared-with-me-resource',
  template: `
    <div class="lists-shared-resource">
      <div class="shared-header">
        <div class="shared-header__titleblock">
          <i class="fa-solid fa-share-nodes"></i>
          <h2>Shared With Me</h2>
        </div>
      </div>
      <mj-lists-shared-with-me (OpenList)="onOpenList($event)"></mj-lists-shared-with-me>
    </div>
  `,
  styles: [`
    .lists-shared-resource {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 16px 24px;
      gap: 16px;
      overflow: hidden;
    }
    .shared-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .shared-header__titleblock {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .shared-header__titleblock i {
      font-size: 20px;
      color: var(--mj-brand-primary);
    }
    .shared-header__titleblock h2 {
      font-size: 18px;
      font-weight: 600;
      margin: 0;
      color: var(--mj-text-primary);
    }
    mj-lists-shared-with-me {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
  `],
  encapsulation: ViewEncapsulation.None,
})
export class ListsSharedWithMeResource extends BaseResourceComponent {
  constructor(
    private cdr: ChangeDetectorRef,
    private tabService: TabService,
  ) {
    super();
  }

  async ngOnInit() {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  ngOnDestroy() {
    super.ngOnDestroy();
  }

  public onOpenList(payload: { ListID: string; ListName: string }): void {
    const appId = this.Data?.Configuration?.applicationId || '';
    this.tabService.OpenList(payload.ListID, payload.ListName, appId);
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Shared With Me';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-share-nodes';
  }
}

/** Tree-shaking prevention */
export function LoadListsSharedWithMeResource() {}
