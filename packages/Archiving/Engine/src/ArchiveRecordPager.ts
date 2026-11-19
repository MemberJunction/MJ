import { BaseEntity, CompositeKey, EntityInfo, IsKeysetPaginationOrderableType, RunView, UserInfo } from '@memberjunction/core';

/**
 * Pages through the records that match an archive filter, one page of at most
 * `pageSize` records at a time, ordered by primary key.
 *
 * Entities with a single orderable primary key use keyset paging (`AfterKey`): each page
 * starts after the last key of the previous one, so records that leave the filter while
 * the run processes them (stripped or deleted) never shift later pages. Other entities use
 * `StartRow`, and the caller reports how many records of each page left the filter so the
 * offset advances only past the records that still match.
 *
 * Paging ends after the first page that comes back shorter than `pageSize`.
 */
export class ArchiveRecordPager {
    private readonly useKeyset: boolean;
    private lastKey: CompositeKey | undefined;
    private offset = 0;
    private done = false;

    constructor(
        private readonly entityInfo: EntityInfo,
        private readonly filter: string,
        private readonly pageSize: number,
        private readonly contextUser: UserInfo
    ) {
        const keys = entityInfo.PrimaryKeys;
        this.useKeyset = keys.length === 1 && IsKeysetPaginationOrderableType(keys[0].Type);
    }

    /** True once a page has come back shorter than the page size. */
    public get Done(): boolean {
        return this.done;
    }

    /** True when this pager uses keyset paging rather than `StartRow`. */
    public get UsesKeyset(): boolean {
        return this.useKeyset;
    }

    /**
     * Loads the next page of matching records. Throws when the query fails.
     */
    public async NextPage(): Promise<BaseEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<BaseEntity>({
            EntityName: this.entityInfo.Name,
            ExtraFilter: this.filter,
            OrderBy: this.entityInfo.PrimaryKeys.map(pk => pk.Name).join(', '),
            MaxRows: this.pageSize,
            ...(this.useKeyset ? { AfterKey: this.lastKey } : { StartRow: this.offset + 1 }),
            BypassCache: true,
            ResultType: 'entity_object',
        }, this.contextUser);

        if (!result.Success) {
            throw new Error(`Failed to load records for entity "${this.entityInfo.Name}": ${result.ErrorMessage}`);
        }
        return result.Results;
    }

    /**
     * Moves past a processed page. `leftFilter` is how many of its records no longer match
     * the filter (stripped or deleted); only `StartRow` paging uses it.
     */
    public Advance(page: BaseEntity[], leftFilter: number): void {
        if (page.length < this.pageSize) {
            this.done = true;
            return;
        }
        if (this.useKeyset) {
            this.lastKey = page[page.length - 1].PrimaryKey;
        } else {
            this.offset += page.length - leftFilter;
        }
    }
}
