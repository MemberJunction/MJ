import { BaseEntity, IMetadataProvider, SimpleEmbeddingResult, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJMLComponentTypeEntity } from '@memberjunction/core-entities';
import { EmbedTextLocalHelper } from './util';

/**
 * Server-side ML Component Type entity — the node in the component **inheritance tree**.
 *
 * Two jobs:
 *
 *  1. **Embed the story.** Every type carries a `Story`: one or two sentences saying what this
 *     family of components MEANS, in business terms, not mathematical ones. `StoryVector` is
 *     what makes that story searchable — "find me components that explain themselves" —
 *     so it is generated here on save, next to the text it describes, and can never drift
 *     from it. Same pattern as `MJ: Components`.
 *
 *  2. **Keep the tree principled.** A property declared on a node is supposed to hold for
 *     everything beneath it, and the resolver walks parent→leaf trusting that. Two cheap
 *     invariants protect that trust at the only place it can be broken — the write:
 *     a node may not be its own parent, and a child's `Kind` must equal its parent's. A
 *     `Preprocessing` node hanging under `Model` would make every profile resolved through
 *     it quietly wrong, and nothing downstream would notice.
 *
 * Structural rules needing the WHOLE tree (contradictory Add/Remove pairs, hoist
 * suggestions, narrowing direction) belong to `lintComponentTree` in
 * `@memberjunction/predictive-studio-core`, which runs over the loaded tree rather than
 * per-row. This class only enforces what one row can prove on its own.
 */
@RegisterClass(BaseEntity, 'MJ: ML Component Types')
export class MJMLComponentTypeEntityServer extends MJMLComponentTypeEntity {
    /** Enable async validation so the parent-consistency checks run. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    /** Generate the story embedding, then save. */
    public override async Save(): Promise<boolean> {
        await this.GenerateEmbeddingsByFieldName([
            { fieldName: 'Story', vectorFieldName: 'StoryVector', modelFieldName: 'StoryEmbeddingModelID' },
        ]);
        return super.Save();
    }

    /**
     * Async invariants: the JSON columns must parse, and the node's position in the tree must
     * be sound. Fast-pathed — the parent lookup only happens when `ParentID` or `Kind` is
     * actually changing.
     */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        this.applyErrors(result, [
            ...validateJsonColumn('SpecSchema', this.SpecSchema),
            ...validateJsonColumn('DefaultSpec', this.DefaultSpec),
            ...this.validateSelfParent(),
        ]);
        if (!result.Success) return result;

        if (this.needsParentCheck()) {
            this.applyErrors(result, await this.validateParentKind());
        }
        return result;
    }

    /** A node cannot be its own parent — the one cycle a single row can prove by itself. */
    private validateSelfParent(): ValidationErrorInfo[] {
        if (this.ParentID && this.ID && this.ParentID.toLowerCase() === this.ID.toLowerCase()) {
            return [
                new ValidationErrorInfo(
                    'ParentID',
                    `A component type cannot be its own parent — that makes the inheritance walk non-terminating, ` +
                        `so no profile below this node could ever be resolved.`,
                    this.ParentID,
                    ValidationErrorType.Failure
                ),
            ];
        }
        return [];
    }

    /** Only re-check the parent when the edge or the Kind is actually moving. */
    private needsParentCheck(): boolean {
        if (!this.ParentID) return false;
        if (!this.IsSaved) return true;
        return (this.GetFieldByName('ParentID')?.Dirty ?? false) || (this.GetFieldByName('Kind')?.Dirty ?? false);
    }

    /**
     * A child must share its parent's `Kind`. Kind partitions the tree into seven independent
     * spaces (Model, Preprocessing, Statistic, Input, Output, Parameter, Structure); a node
     * that changes Kind mid-branch silently corrupts every profile resolved through it.
     */
    private async validateParentKind(): Promise<ValidationErrorInfo[]> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const parent = await md.GetEntityObject<MJMLComponentTypeEntity>('MJ: ML Component Types', this.ContextCurrentUser);
        if (!(await parent.Load(this.ParentID as string))) {
            return []; // a dangling ParentID is the FK constraint's problem, not this check's
        }
        if (parent.Kind !== this.Kind) {
            return [
                new ValidationErrorInfo(
                    'Kind',
                    `Kind '${this.Kind}' does not match the parent '${parent.Name}' (Kind '${parent.Kind}'). ` +
                        `Kind partitions the component tree into independent spaces — a branch that changes Kind ` +
                        `makes every inherited property below it wrong. Move this node under a '${this.Kind}' parent instead.`,
                    this.Kind,
                    ValidationErrorType.Failure
                ),
            ];
        }
        return [];
    }

    /** Fold errors into the result, failing the save on any Failure. */
    private applyErrors(result: ValidationResult, errors: ValidationErrorInfo[]): void {
        if (errors.length === 0) return;
        result.Errors.push(...errors);
        if (errors.some((e) => e.Type === ValidationErrorType.Failure)) {
            result.Success = false;
        }
    }

    /** Proxy to the shared embedding helper (required by `BaseEntity`'s embedding support). */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }
}

/**
 * PURE check that a nullable JSON column parses (exported for tests and reuse). A blank/null
 * column is legitimate — absence is not malformation. A column we cannot parse is a Failure,
 * because every downstream consumer of it silently degrades instead of erroring.
 *
 * @param fieldName the column being checked, used in the error
 * @param raw the raw column value
 */
export function validateJsonColumn(fieldName: string, raw: string | null | undefined): ValidationErrorInfo[] {
    if (raw == null || raw.trim().length === 0) return [];
    try {
        JSON.parse(raw);
        return [];
    } catch (e) {
        return [
            new ValidationErrorInfo(
                fieldName,
                `${fieldName} is not valid JSON (${e instanceof Error ? e.message : String(e)}).`,
                raw,
                ValidationErrorType.Failure
            ),
        ];
    }
}

/**
 * Tree-shaking guard — dynamic ClassFactory instantiation is invisible to the bundler, so this
 * keeps the registration alive.
 */
export function LoadMJMLComponentTypeEntityServer(): void {
    // no-op
}
