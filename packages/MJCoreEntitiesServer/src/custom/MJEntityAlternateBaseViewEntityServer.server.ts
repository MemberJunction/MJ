import {
    BaseEntity,
    DatabaseProviderBase,
    EntityAlternateBaseViewInfo,
    EntityInfo,
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    IsValidAlternateBaseViewName,
    IsValidSQLIdentifier,
    LogWarning,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from "@memberjunction/core";
import { MJEntityAlternateBaseViewEntity } from "@memberjunction/core-entities";
import { IndexByUUID, RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { SQLParser } from "@memberjunction/sql-parser";
import { GetDialect } from "@memberjunction/sql-dialect";

interface LiveAlternateBaseViewRow {
    ID: string;
    EntityID: string;
    ParentID: string | null;
    Name: string;
    ViewName: string;
    SchemaName: string | null;
}

/**
 * Server-side entity subclass for `MJ: Entity Alternate Base Views`.
 *
 * Enforces:
 * - Immutability of `EntityID` on existing saved records
 * - Logical `Name` format (`IsValidAlternateBaseViewName` — non-empty, no `|`, `:`, or leading `//`)
 * - Physical `ViewName` and optional `SchemaName` identifier format (`IsValidSQLIdentifier`)
 * - Same-entity logical `Name` uniqueness
 * - Cross-entity `(EffectiveSchemaName, ViewName)` uniqueness against every entity's
 *   `BaseView`, `BaseTable`, and registered `AlternateBaseViews` (D13)
 * - Same-entity `ParentID` hierarchy validation and cycle detection (D15)
 * - Live database row and physical SQL view existence verification in `ValidateAsync`
 * - Automatic AST inference of `ParentID` on save when `ParentID` is unset and
 *   the view's SQL definition references a single sibling alternate base view on the same entity (D15)
 */
@RegisterClass(BaseEntity, 'MJ: Entity Alternate Base Views')
export class MJEntityAlternateBaseViewEntityServer extends MJEntityAlternateBaseViewEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateEntityIDImmutability(result);
        this.validateNameAndIdentifiers(result);

        const md = this.ProviderToUse as unknown as IMetadataProvider | undefined;
        const entities = md?.Entities ?? [];
        const owningEntity = this.EntityID
            ? entities.find(e => UUIDsEqual(e.ID, this.EntityID))
            : undefined;

        if (this.EntityID && entities.length > 0 && !owningEntity) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'EntityID',
                    `EntityID '${this.EntityID}' does not match any registered entity in metadata.`,
                    this.EntityID,
                    ValidationErrorType.Failure
                )
            );
            result.Success = false;
            return result;
        }

        if (owningEntity) {
            this.validateUniquenessAndCollisions(result, owningEntity, entities);
            this.validateParentHierarchy(result, owningEntity, entities);
        }

        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const md = this.ProviderToUse as unknown as IMetadataProvider | undefined;
        const entities = md?.Entities ?? [];
        const owningEntity = this.EntityID
            ? entities.find(e => UUIDsEqual(e.ID, this.EntityID))
            : undefined;
        if (!owningEntity) {
            return result;
        }

        await this.validateAgainstLiveDatabaseRows(result, owningEntity, entities);
        await this.validatePhysicalViewExistsIfUsable(result, owningEntity);

        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (typeof this.Name === 'string') {
            this.Name = this.Name.trim();
        }
        if (typeof this.ViewName === 'string') {
            this.ViewName = this.ViewName.trim();
        }
        if (typeof this.SchemaName === 'string') {
            const trimmedSchema = this.SchemaName.trim();
            this.SchemaName = trimmedSchema.length > 0 ? trimmedSchema : null;
        }

        // Auto-populate ParentID from the SQL view definition AST when ParentID is not explicitly set
        if (!this.ParentID) {
            await this.resolveAndPopulateParentIDFromDatabase();
        }

        return super.Save(options);
    }

    private validateEntityIDImmutability(result: ValidationResult): void {
        if (this.IsSaved && this.GetFieldByName('EntityID')?.Dirty === true) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'EntityID',
                    `EntityID cannot be changed on an existing Alternate Base View record.`,
                    this.EntityID,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    /**
     * Validates `Name`, `ViewName`, and optional `SchemaName` using zero-dependency
     * validators from `@memberjunction/core`.
     */
    private validateNameAndIdentifiers(result: ValidationResult): void {
        if (!IsValidAlternateBaseViewName(this.Name)) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'Name',
                    `Alternate Base View Name '${this.Name ?? ''}' is invalid. Name must be non-empty after trimming and must not contain '|', ':', or start with '//'.`,
                    this.Name,
                    ValidationErrorType.Failure
                )
            );
        }

        if (!IsValidSQLIdentifier(this.ViewName)) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'ViewName',
                    `ViewName '${this.ViewName ?? ''}' is not a valid bare SQL identifier. Provide only the view name without schema prefix, brackets, quotes, or whitespace.`,
                    this.ViewName,
                    ValidationErrorType.Failure
                )
            );
        }

        if (this.SchemaName != null && this.SchemaName.trim().length > 0 && !IsValidSQLIdentifier(this.SchemaName.trim())) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'SchemaName',
                    `SchemaName '${this.SchemaName}' is not a valid bare SQL identifier.`,
                    this.SchemaName,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    /**
     * Validates:
     * 1. Same-entity logical `Name` uniqueness
     * 2. Cross-entity `(EffectiveSchemaName, ViewName)` uniqueness against every entity's
     *    `BaseView`, `BaseTable`, and registered `AlternateBaseViews` (D13)
     */
    private validateUniquenessAndCollisions(
        result: ValidationResult,
        owningEntity: EntityInfo,
        allEntities: EntityInfo[]
    ): void {
        const trimmedName = (this.Name ?? '').trim().toLowerCase();
        const trimmedViewName = (this.ViewName ?? '').trim().toLowerCase();
        const effectiveSchema = ((this.SchemaName ?? '').trim() || owningEntity.SchemaName || '').toLowerCase();
        if (!trimmedViewName) {
            return;
        }

        if (trimmedName) {
            this.checkSameEntityLogicalNameDuplicate(result, owningEntity, trimmedName);
        }
        for (const entity of allEntities) {
            this.checkCrossEntityPhysicalCollision(result, entity, effectiveSchema, trimmedViewName);
        }
    }

    private checkSameEntityLogicalNameDuplicate(
        result: ValidationResult,
        owningEntity: EntityInfo,
        trimmedName: string
    ): void {
        const duplicateLogicalName = (owningEntity.AlternateBaseViews ?? []).find(
            abv => !UUIDsEqual(abv.ID, this.ID) && abv.Name.trim().toLowerCase() === trimmedName
        );
        if (duplicateLogicalName) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'Name',
                    `Entity '${owningEntity.Name}' already has an alternate base view named '${duplicateLogicalName.Name}'.`,
                    this.Name,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    private checkCrossEntityPhysicalCollision(
        result: ValidationResult,
        entity: EntityInfo,
        effectiveSchema: string,
        trimmedViewName: string
    ): void {
        const entitySchema = (entity.SchemaName ?? '').toLowerCase();
        if (entitySchema === effectiveSchema) {
            if ((entity.BaseView ?? '').toLowerCase() === trimmedViewName) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'ViewName',
                        `Physical view '${effectiveSchema}.${this.ViewName}' collides with the canonical BaseView of entity '${entity.Name}'.`,
                        this.ViewName,
                        ValidationErrorType.Failure
                    )
                );
            } else if ((entity.BaseTable ?? '').toLowerCase() === trimmedViewName) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'ViewName',
                        `Physical view '${effectiveSchema}.${this.ViewName}' collides with the BaseTable of entity '${entity.Name}'.`,
                        this.ViewName,
                        ValidationErrorType.Failure
                    )
                );
            }
        }
        this.checkExistingAlternateViewCollisionsOnEntity(result, entity, effectiveSchema, trimmedViewName);
    }

    private checkExistingAlternateViewCollisionsOnEntity(
        result: ValidationResult,
        entity: EntityInfo,
        effectiveSchema: string,
        trimmedViewName: string
    ): void {
        for (const existingAbv of entity.AlternateBaseViews ?? []) {
            if (UUIDsEqual(existingAbv.ID, this.ID)) {
                continue;
            }
            const existingSchema = (existingAbv.EffectiveSchemaName || entity.SchemaName || '').toLowerCase();
            if (existingSchema === effectiveSchema && existingAbv.ViewName.trim().toLowerCase() === trimmedViewName) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'ViewName',
                        `Physical view '${effectiveSchema}.${this.ViewName}' is already registered as alternate base view '${existingAbv.Name}' on entity '${entity.Name}'.`,
                        this.ViewName,
                        ValidationErrorType.Failure
                    )
                );
            }
        }
    }

    /**
     * Validates `ParentID` (when set):
     * - Cannot self-reference (`ParentID === ID`)
     * - Parent must exist and belong to the same `EntityID`
     * - Parent chain must be acyclic
     */
    private validateParentHierarchy(
        result: ValidationResult,
        owningEntity: EntityInfo,
        allEntities: EntityInfo[]
    ): void {
        if (!this.ParentID) {
            return;
        }
        if (this.ID && UUIDsEqual(this.ParentID, this.ID)) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'ParentID',
                    `An alternate base view cannot reference itself as ParentID.`,
                    this.ParentID,
                    ValidationErrorType.Failure
                )
            );
            return;
        }

        const siblingsById = IndexByUUID(owningEntity.AlternateBaseViews ?? []);
        const sameEntityParent = siblingsById.Get(this.ParentID);
        if (!sameEntityParent) {
            this.checkCrossEntityParentOwner(result, owningEntity, allEntities);
            return;
        }
        this.checkParentChainForCycle(result, owningEntity, sameEntityParent, siblingsById);
    }

    private checkCrossEntityParentOwner(
        result: ValidationResult,
        owningEntity: EntityInfo,
        allEntities: EntityInfo[]
    ): void {
        const otherEntityOwner = allEntities.find(e =>
            IndexByUUID(e.AlternateBaseViews ?? []).Has(this.ParentID!)
        );
        if (otherEntityOwner && !UUIDsEqual(otherEntityOwner.ID, owningEntity.ID)) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'ParentID',
                    `ParentID '${this.ParentID}' belongs to entity '${otherEntityOwner.Name}', not '${owningEntity.Name}'. Derived alternate base views must belong to the same entity.`,
                    this.ParentID,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    private checkParentChainForCycle(
        result: ValidationResult,
        owningEntity: EntityInfo,
        sameEntityParent: EntityAlternateBaseViewInfo,
        siblingsById: { Get(id: string): EntityAlternateBaseViewInfo | undefined }
    ): void {
        const visited = new Set<string>();
        if (this.ID) {
            visited.add(this.ID.toLowerCase());
        }
        let cursor: EntityAlternateBaseViewInfo | undefined = sameEntityParent;
        while (cursor) {
            const cursorKey = cursor.ID.toLowerCase();
            if (visited.has(cursorKey)) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'ParentID',
                        `ParentID '${this.ParentID}' introduces a cycle in the alternate base view hierarchy for '${owningEntity.Name}'.`,
                        this.ParentID,
                        ValidationErrorType.Failure
                    )
                );
                return;
            }
            visited.add(cursorKey);
            cursor = cursor.ParentID ? siblingsById.Get(cursor.ParentID) : undefined;
        }
    }

    /**
     * Queries `MJ: Entity Alternate Base Views` with `BypassCache: true` so uniqueness,
     * cross-entity collision, and `ParentID` hierarchy checks also catch rows created
     * since the last metadata refresh.
     */
    private async validateAgainstLiveDatabaseRows(
        result: ValidationResult,
        owningEntity: EntityInfo,
        allEntities: EntityInfo[]
    ): Promise<void> {
        const rvProvider = this.ProviderToUse as unknown as Partial<IRunViewProvider> | undefined;
        if (!rvProvider || typeof rvProvider.RunView !== 'function') {
            return;
        }
        try {
            const rvResult = await rvProvider.RunView<LiveAlternateBaseViewRow>(
                {
                    EntityName: 'MJ: Entity Alternate Base Views',
                    Fields: ['ID', 'EntityID', 'ParentID', 'Name', 'ViewName', 'SchemaName'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                this.ContextCurrentUser,
            );
            if (!rvResult?.Success || !rvResult.Results || rvResult.Results.length === 0) {
                return;
            }
            this.checkLiveDatabaseRowsForConflicts(result, owningEntity, allEntities, rvResult.Results);
        } catch (err) {
            LogWarning(
                `MJEntityAlternateBaseViewEntityServer.validateAgainstLiveDatabaseRows: live RunView check skipped (${err instanceof Error ? err.message : String(err)})`,
            );
        }
    }

    private checkLiveDatabaseRowsForConflicts(
        result: ValidationResult,
        owningEntity: EntityInfo,
        allEntities: EntityInfo[],
        rows: LiveAlternateBaseViewRow[]
    ): void {
        const entitiesById = IndexByUUID(allEntities);
        const trimmedName = (this.Name ?? '').trim().toLowerCase();
        const trimmedViewName = (this.ViewName ?? '').trim().toLowerCase();
        const effectiveSchema = ((this.SchemaName ?? '').trim() || owningEntity.SchemaName || '').toLowerCase();

        for (const row of rows) {
            if (!row.ID || UUIDsEqual(row.ID, this.ID)) {
                continue;
            }
            const rowEntity = entitiesById.Get(row.EntityID);
            const rowSchema = ((row.SchemaName ?? '').trim() || rowEntity?.SchemaName || '').toLowerCase();
            if (
                UUIDsEqual(row.EntityID, owningEntity.ID) &&
                trimmedName &&
                (row.Name ?? '').trim().toLowerCase() === trimmedName &&
                !result.Errors.some(e => e.Source === 'Name')
            ) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'Name',
                        `Entity '${owningEntity.Name}' already has an alternate base view named '${row.Name}'.`,
                        this.Name,
                        ValidationErrorType.Failure
                    )
                );
            }
            if (
                trimmedViewName &&
                rowSchema === effectiveSchema &&
                (row.ViewName ?? '').trim().toLowerCase() === trimmedViewName &&
                !result.Errors.some(e => e.Source === 'ViewName')
            ) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'ViewName',
                        `Physical view '${effectiveSchema}.${this.ViewName}' is already registered as alternate base view '${row.Name}' on entity '${rowEntity?.Name ?? row.EntityID}'.`,
                        this.ViewName,
                        ValidationErrorType.Failure
                    )
                );
            }
        }
    }

    /**
     * When `Status` is `'Active'` or `'Deprecated'` and a database provider is active, verifies
     * that the physical SQL view exists in the database catalog.
     */
    private async validatePhysicalViewExistsIfUsable(
        result: ValidationResult,
        owningEntity: EntityInfo
    ): Promise<void> {
        if (this.Status !== 'Active' && this.Status !== 'Deprecated') {
            return;
        }
        const effectiveSchema = (this.SchemaName ?? '').trim() || owningEntity.SchemaName;
        if (!IsValidSQLIdentifier(this.ViewName) || !IsValidSQLIdentifier(effectiveSchema)) {
            return;
        }
        const dbProvider = this.ProviderToUse as unknown as Partial<DatabaseProviderBase> | undefined;
        if (!dbProvider || typeof dbProvider.ExecuteSQL !== 'function') {
            return;
        }
        const isPostgres = (this.ProviderToUse as { PlatformKey?: string })?.PlatformKey === 'postgresql';
        const probeSql = isPostgres
            ? `SELECT CASE WHEN to_regclass('${effectiveSchema}.${this.ViewName}') IS NOT NULL THEN 1 ELSE 0 END AS "ViewExists"`
            : `SELECT CASE WHEN OBJECT_ID(N'[${effectiveSchema}].[${this.ViewName}]', N'V') IS NOT NULL THEN 1 ELSE 0 END AS ViewExists`;
        try {
            const rows = await dbProvider.ExecuteSQL<{ ViewExists?: number }>(probeSql);
            if (rows && rows.length > 0 && rows[0] && rows[0].ViewExists === 0) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'ViewName',
                        `Physical SQL view '${effectiveSchema}.${this.ViewName}' does not exist in the database.`,
                        this.ViewName,
                        ValidationErrorType.Failure
                    )
                );
            }
        } catch (err) {
            LogWarning(
                `MJEntityAlternateBaseViewEntityServer.validatePhysicalViewExistsIfUsable: catalog probe skipped for '${effectiveSchema}.${this.ViewName}' (${err instanceof Error ? err.message : String(err)})`,
            );
        }
    }

    /**
     * Queries the database catalog for the SQL definition of `EffectiveSchemaName.ViewName`
     * when running against a database provider, then invokes `TryAutoPopulateParentIDFromAST`.
     */
    private async resolveAndPopulateParentIDFromDatabase(): Promise<void> {
        if (this.ParentID || !this.EntityID || !IsValidSQLIdentifier(this.ViewName)) {
            return;
        }

        const md = this.ProviderToUse as unknown as IMetadataProvider | undefined;
        const owningEntity = md?.Entities?.find(e => UUIDsEqual(e.ID, this.EntityID));
        if (!owningEntity || (owningEntity.AlternateBaseViews ?? []).length === 0) {
            return;
        }

        const effectiveSchema = (this.SchemaName ?? '').trim() || owningEntity.SchemaName;
        if (!IsValidSQLIdentifier(effectiveSchema)) {
            return;
        }

        const dbProvider = this.ProviderToUse as unknown as Partial<DatabaseProviderBase> | undefined;
        if (!dbProvider || typeof dbProvider.ExecuteSQL !== 'function') {
            return;
        }

        const isPostgres = (this.ProviderToUse as { PlatformKey?: string })?.PlatformKey === 'postgresql';
        const sql = isPostgres
            ? `SELECT pg_get_viewdef(to_regclass('${effectiveSchema}.${this.ViewName}'), true) AS "ViewDefinition"`
            : `SELECT OBJECT_DEFINITION(OBJECT_ID(N'[${effectiveSchema}].[${this.ViewName}]')) AS ViewDefinition`;

        try {
            const rows = await dbProvider.ExecuteSQL<{ ViewDefinition: string | null }>(sql);
            const viewDef = rows?.[0]?.ViewDefinition;
            if (viewDef && viewDef.trim().length > 0) {
                this.TryAutoPopulateParentIDFromAST(viewDef);
            }
        } catch (err) {
            LogWarning(
                `MJEntityAlternateBaseViewEntityServer.resolveAndPopulateParentIDFromDatabase: catalog lookup failed for '${effectiveSchema}.${this.ViewName}' on entity '${owningEntity.Name}': ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /**
     * Inspects `viewDefinitionSQL` with `SQLParser.ExtractTableRefs` and, if the SQL
     * references exactly one sibling alternate base view on the same entity (without creating
     * a cycle), automatically populates `this.ParentID`.
     */
    public TryAutoPopulateParentIDFromAST(viewDefinitionSQL: string): void {
        if (this.ParentID || !viewDefinitionSQL || !this.EntityID) {
            return;
        }

        const md = this.ProviderToUse as unknown as IMetadataProvider | undefined;
        const owningEntity = (md?.Entities ?? []).find(e => UUIDsEqual(e.ID, this.EntityID));
        if (!owningEntity || !owningEntity.AlternateBaseViews || owningEntity.AlternateBaseViews.length === 0) {
            return;
        }

        const isPostgres = (this.ProviderToUse as { PlatformKey?: string })?.PlatformKey === 'postgresql';
        try {
            const tableRefs = SQLParser.ExtractTableRefs(
                viewDefinitionSQL,
                GetDialect(isPostgres ? 'postgres' : 'sqlserver'),
            );
            if (!tableRefs || tableRefs.length === 0) {
                return;
            }
            const matchedSiblings = this.findMatchingSiblingsInTableRefs(owningEntity, tableRefs);
            if (matchedSiblings.size === 1) {
                const candidate = Array.from(matchedSiblings.values())[0];
                if (!this.wouldCreateCycle(candidate, owningEntity.AlternateBaseViews)) {
                    this.ParentID = candidate.ID;
                }
            }
        } catch (err) {
            LogWarning(
                `MJEntityAlternateBaseViewEntityServer.TryAutoPopulateParentIDFromAST: failed to parse view definition for '${this.ViewName}' on entity '${owningEntity.Name}': ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    private findMatchingSiblingsInTableRefs(
        owningEntity: EntityInfo,
        tableRefs: Array<{ TableName: string; SchemaName: string | null }>
    ): Map<string, EntityAlternateBaseViewInfo> {
        const matchedSiblings = new Map<string, EntityAlternateBaseViewInfo>();
        for (const ref of tableRefs) {
            const refTableLower = ref.TableName.toLowerCase();
            const refSchemaLower = ref.SchemaName ? ref.SchemaName.toLowerCase() : null;
            for (const sibling of owningEntity.AlternateBaseViews ?? []) {
                if ((this.ID && UUIDsEqual(sibling.ID, this.ID)) ||
                    (this.ViewName && sibling.ViewName.toLowerCase() === this.ViewName.trim().toLowerCase())) {
                    continue;
                }
                if (sibling.ViewName.toLowerCase() !== refTableLower) {
                    continue;
                }
                const siblingSchema = (sibling.EffectiveSchemaName || owningEntity.SchemaName || '').toLowerCase();
                if (refSchemaLower && refSchemaLower !== siblingSchema) {
                    continue;
                }
                matchedSiblings.set(sibling.ID.toLowerCase(), sibling);
            }
        }
        return matchedSiblings;
    }

    private wouldCreateCycle(
        candidateParent: EntityAlternateBaseViewInfo,
        siblings: EntityAlternateBaseViewInfo[]
    ): boolean {
        if (!this.ID) {
            return false;
        }
        const siblingsById = IndexByUUID(siblings);
        const visited = new Set<string>([this.ID.toLowerCase()]);
        let cursor: EntityAlternateBaseViewInfo | undefined = candidateParent;
        while (cursor) {
            const key = cursor.ID.toLowerCase();
            if (visited.has(key)) {
                return true;
            }
            visited.add(key);
            cursor = cursor.ParentID ? siblingsById.Get(cursor.ParentID) : undefined;
        }
        return false;
    }
}
