import {
    BaseEntity,
    CompositeKey,
    DatabasePlatform,
    EntityFieldInfo,
    EntityFieldTSType,
    EntityInfo,
    IsKeysetPaginationOrderableType,
    RunView,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';

/**
 * Pages through the records that match an archive filter, one page of at most
 * `pageSize` records at a time, ordered by primary key.
 *
 * Every page starts after the last key of the previous page, so paging never depends on
 * what the run did to the records it loaded: a record that is stripped, deleted, skipped
 * or fails is never loaded twice, and a record that leaves the filter never shifts later
 * pages. The cursor is copied when a page loads, before any record on it is processed,
 * because a deleted entity object clears its own key.
 *
 * Entities with a single orderable primary key use RunView's `AfterKey`. Entities with a
 * composite key seek with an explicit `(k1 > v1) OR (k1 = v1 AND k2 > v2) ...` filter;
 * every key column must then be a string or number column, because a date/time or
 * boolean key cannot be compared exactly from its JavaScript value.
 *
 * Paging ends at the first empty page, not the first short one: a view can return fewer
 * rows than asked for (UserViewMaxRows, a provider-wide cap) while more rows remain.
 */
export class ArchiveRecordPager {
    private readonly keyFields: EntityFieldInfo[];
    private readonly useAfterKey: boolean;
    private lastKey: CompositeKey | undefined;
    private done = false;

    /**
     * Throws when the entity's primary key cannot be paged: a composite key with a
     * column that is neither a string nor a number column.
     */
    constructor(
        private readonly entityInfo: EntityInfo,
        private readonly filter: string,
        private readonly pageSize: number,
        private readonly platform: DatabasePlatform,
        private readonly contextUser: UserInfo
    ) {
        this.keyFields = entityInfo.PrimaryKeys;
        const firstKey = entityInfo.FirstPrimaryKey; // first-pk-ok: AfterKey is used only when the key has exactly one column
        this.useAfterKey = this.keyFields.length === 1 && IsKeysetPaginationOrderableType(firstKey?.Type);
        if (!this.useAfterKey) {
            this.requireSeekableKey();
        }
    }

    /** True once a page has come back empty. */
    public get Done(): boolean {
        return this.done;
    }

    /**
     * Loads the next page of matching records and moves the cursor past it. Returns an
     * empty array, and sets {@link Done}, when no matching record remains. Throws when the
     * query fails.
     */
    public async NextPage(): Promise<BaseEntity[]> {
        if (this.done) {
            return [];
        }
        const rv = new RunView();
        const result = await rv.RunView<BaseEntity>(this.buildParams(), this.contextUser);
        if (!result.Success) {
            throw new Error(`Failed to load records for entity "${this.entityInfo.Name}": ${result.ErrorMessage}`);
        }
        const page = result.Results;
        if (page.length === 0) {
            this.done = true;
        } else {
            this.lastKey = this.copyKey(page[page.length - 1]);
        }
        return page;
    }

    private buildParams(): RunViewParams {
        const params: RunViewParams = {
            EntityName: this.entityInfo.Name,
            ExtraFilter: this.filter,
            MaxRows: this.pageSize,
            BypassCache: true,
            ResultType: 'entity_object',
        };
        if (this.useAfterKey) {
            params.OrderBy = this.entityInfo.FirstPrimaryKey.Name; // first-pk-ok: single-column key (useAfterKey)
            params.AfterKey = this.lastKey;
        } else {
            params.OrderBy = this.keyFields.map(f => `[${f.Name}]`).join(', ');
            if (this.lastKey) {
                params.ExtraFilter = `(${this.filter}) AND (${this.buildSeekFilter(this.lastKey)})`;
            }
        }
        return params;
    }

    /** Copies the record's key values, which a later Delete() would clear. */
    private copyKey(record: BaseEntity): CompositeKey {
        return new CompositeKey(record.PrimaryKey.KeyValuePairs.map(kvp => ({ FieldName: kvp.FieldName, Value: kvp.Value })));
    }

    /**
     * `(k1 > v1) OR (k1 = v1 AND k2 > v2) OR ...`: the rows that sort after `key` in
     * key-column order.
     */
    private buildSeekFilter(key: CompositeKey): string {
        const literals = this.keyFields.map(f => this.keyLiteral(f, key.GetValueByFieldName(f.Name)));
        const branches = this.keyFields.map((field, i) => {
            const equal = this.keyFields.slice(0, i).map((prior, j) => `[${prior.Name}] = ${literals[j]}`);
            return `(${[...equal, `[${field.Name}] > ${literals[i]}`].join(' AND ')})`;
        });
        return branches.join(' OR ');
    }

    /** The SQL literal for one key value: a number, or a quoted string (N'...' on SQL Server). */
    private keyLiteral(field: EntityFieldInfo, value: unknown): string {
        if (field.TSType === EntityFieldTSType.Number) {
            const num = Number(value);
            if (!Number.isFinite(num)) {
                throw new Error(`Key column "${field.Name}" of entity "${this.entityInfo.Name}" holds a non-numeric value`);
            }
            return String(num);
        }
        const quoted = `'${String(value).replace(/'/g, "''")}'`;
        return this.platform === 'sqlserver' && field.Type?.toLowerCase().startsWith('n') ? `N${quoted}` : quoted;
    }

    private requireSeekableKey(): void {
        const unseekable = this.keyFields.find(f =>
            (f.TSType !== EntityFieldTSType.String && f.TSType !== EntityFieldTSType.Number) || /[[\]]/.test(f.Name)
        );
        if (this.keyFields.length === 0 || unseekable) {
            throw new Error(
                `Entity "${this.entityInfo.Name}" cannot be archived in pages: its primary key ` +
                `${unseekable ? `column "${unseekable.Name}" is not a string or number column` : 'is missing'}.`
            );
        }
    }
}
