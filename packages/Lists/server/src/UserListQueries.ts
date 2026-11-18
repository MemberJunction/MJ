import { IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJQueryCategoryEntity, MJQueryEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';

/** The shipped "User Lists" query category (metadata/query-categories), parent of every user's own. */
export const USER_LISTS_QUERY_CATEGORY_ID = 'D6E999CC-BF2C-4D98-8BC8-4A86764D164C';

/** The outcome of saving a query a list will refresh from. */
export type SaveUserListQueryResult =
  | { Saved: true; QueryID: string; QueryName: string }
  | { Saved: false; Reason: string };

/**
 * Saves SQL written in a conversation as an MJ Query so a list can refresh from it.
 *
 * The query is saved as the acting user, with status `Pending`: approving it stays the owner's
 * choice, if they have the rights. It goes in the user's own subcategory of "User Lists", keyed by
 * user ID and created on first use. A save the user isn't permitted to make is reported, not
 * thrown, so the caller can fall back to a list that doesn't refresh.
 *
 * Callers must check the SQL before saving it (for an action, `CheckAdhocSQL`): saving does not.
 */
export class UserListQueries {
  constructor(
    private readonly contextUser: UserInfo,
    private readonly provider?: IMetadataProvider,
  ) {}

  /** Saves the SQL as a Pending query in the user's User Lists subcategory, under a name not yet used there. */
  public async SaveAsync(args: { Name: string; SQL: string; Description?: string }): Promise<SaveUserListQueryResult> {
    if (!this.canCreate('MJ: Queries')) return { Saved: false, Reason: "You don't have permission to save queries." };
    const category = await this.userCategoryAsync();
    if ('Reason' in category) return { Saved: false, Reason: category.Reason };

    const query = await this.metadata().GetEntityObject<MJQueryEntity>('MJ: Queries', this.contextUser);
    query.NewRecord();
    query.Name = await this.unusedNameAsync(category.ID, args.Name);
    query.SQL = args.SQL;
    query.Status = 'Pending';
    query.CategoryID = category.ID;
    if (args.Description) query.Description = args.Description;
    if (!(await query.Save())) {
      return { Saved: false, Reason: `The query could not be saved: ${query.LatestResult?.CompleteMessage ?? 'unknown error'}` };
    }
    return { Saved: true, QueryID: query.ID, QueryName: query.Name };
  }

  /** The user's subcategory of User Lists, created when it doesn't exist yet. */
  private async userCategoryAsync(): Promise<{ ID: string } | { Reason: string }> {
    const existing = await this.runView().RunView<Pick<MJQueryCategoryEntity, 'ID'>>({
      EntityName: 'MJ: Query Categories',
      ExtraFilter: `ParentID='${USER_LISTS_QUERY_CATEGORY_ID}' AND UserID='${EscapeSQLString(this.contextUser.ID)}'`,
      Fields: ['ID'],
      ResultType: 'simple',
      BypassCache: true,
    }, this.contextUser);
    if (!existing.Success) return { Reason: `Could not read query categories: ${existing.ErrorMessage}` };
    if (existing.Results.length > 0) return { ID: existing.Results[0].ID };
    return this.createUserCategoryAsync();
  }

  private async createUserCategoryAsync(): Promise<{ ID: string } | { Reason: string }> {
    if (!this.canCreate('MJ: Query Categories')) {
      return { Reason: "You don't have permission to create your folder in User Lists, where list queries are saved." };
    }
    const md = this.metadata();
    const root = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', this.contextUser);
    if (!(await root.Load(USER_LISTS_QUERY_CATEGORY_ID))) {
      return { Reason: 'The "User Lists" query category is missing from this database (it ships in core metadata).' };
    }
    const category = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', this.contextUser);
    category.NewRecord();
    category.Name = this.contextUser.Name;
    category.ParentID = root.ID;
    category.UserID = this.contextUser.ID;
    category.Description = `Queries ${this.contextUser.Name}'s lists refresh from.`;
    if (!(await category.Save())) {
      const message = category.LatestResult?.CompleteMessage ?? 'unknown error';
      LogError(`UserListQueries: could not create the User Lists category for ${this.contextUser.ID}: ${message}`);
      return { Reason: `Your User Lists query category could not be created: ${message}` };
    }
    return { ID: category.ID };
  }

  /** `name`, or `name (2)`, `name (3)`... when the category already has a query by that name. */
  private async unusedNameAsync(categoryID: string, name: string): Promise<string> {
    const base = name.trim();
    const result = await this.runView().RunView<Pick<MJQueryEntity, 'Name'>>({
      EntityName: 'MJ: Queries',
      ExtraFilter: `CategoryID='${EscapeSQLString(categoryID)}'`,
      Fields: ['Name'],
      ResultType: 'simple',
      BypassCache: true,
    }, this.contextUser);
    const taken = new Set((result.Success ? result.Results : []).map((q) => q.Name.trim().toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} (${n})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  /**
   * Checked before saving, so a user without the right gets one plain sentence instead of the
   * save's multi-line permission error. The save still enforces it.
   */
  private canCreate(entityName: string): boolean {
    return this.metadata().EntityByName(entityName)?.GetUserPermisions(this.contextUser).CanCreate === true;
  }

  private metadata(): Metadata {
    return (this.provider as unknown as Metadata | undefined) ?? new Metadata();
  }

  private runView(): RunView {
    return this.provider ? RunView.FromMetadataProvider(this.provider) : new RunView();
  }
}
