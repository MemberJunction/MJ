import { BaseEntity, IMetadataProvider, SimpleEmbeddingResult, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJMLComponentEntity, MJMLComponentTypeEntity } from '@memberjunction/core-entities';
import { EmbedTextLocalHelper } from './util';
import { ValidateJsonAgainstSchemaLite } from './json-schema-lite';
import { validateJsonColumn } from './MJMLComponentTypeEntityServer.server';

/**
 * Server-side ML Component entity — one filled/trained instance of a component type, either
 * a node in a model's composition tree or a standalone reusable part.
 *
 * What this class guarantees:
 *
 *  1. **The story is searchable.** A component's `Story` is the prose half of its identity —
 *     what this part contributes, in business terms. `StoryVector` is generated on save so
 *     reuse-by-meaning ("find me a component that already measures engagement recency") works
 *     off the same text a human reads, and cannot drift from it.
 *
 *  2. **Abstract types are not instantiable.** `Model`, `Linear`, `Preprocessing` and the other
 *     abstract nodes exist to carry inherited properties, not to be filled. An instance of one
 *     has no driver, no spec schema, and nothing to run — it would fail confusingly much later,
 *     at train or score time, far from the save that caused it.
 *
 *  3. **`Spec` conforms to its type's `SpecSchema`.** The type publishes the shape; the instance
 *     must fit it. Checked with the dependency-free {@link ValidateJsonAgainstSchemaLite}. A type
 *     with no published schema leaves the spec freeform. A type whose schema is itself malformed
 *     produces a WARNING, not a Failure — that is a metadata bug on the TYPE row, and it must not
 *     brick every instance of that type.
 *
 *  4. **A root component fills no slot.** `SlotName` names the fillable position a component
 *     occupies in its PARENT — so a component with no parent naming one is a contradiction that
 *     would make the composition graph unreadable.
 */
@RegisterClass(BaseEntity, 'MJ: ML Components')
export class MJMLComponentEntityServer extends MJMLComponentEntity {
    /** Enable async validation so the abstract-type and SpecSchema checks run. */
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

    /** @inheritdoc */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        this.applyErrors(result, [
            ...validateJsonColumn('Spec', this.Spec),
            ...validateJsonColumn('FittedState', this.FittedState),
            ...validateJsonColumn('StoryContribution', this.StoryContribution),
            ...this.validateSelfReferences(),
            ...this.validateSlotName(),
        ]);
        if (!result.Success) return result;

        if (this.needsTypeCheck()) {
            this.applyErrors(result, await this.validateAgainstType());
        }
        return result;
    }

    /** A component can be neither its own parent nor its own reuse source. */
    private validateSelfReferences(): ValidationErrorInfo[] {
        const errors: ValidationErrorInfo[] = [];
        const id = this.ID?.toLowerCase();
        if (!id) return errors;
        if (this.ParentComponentID?.toLowerCase() === id) {
            errors.push(
                new ValidationErrorInfo(
                    'ParentComponentID',
                    'A component cannot be its own parent — the composition tree would never terminate.',
                    this.ParentComponentID,
                    ValidationErrorType.Failure
                )
            );
        }
        if (this.SourceComponentID?.toLowerCase() === id) {
            errors.push(
                new ValidationErrorInfo(
                    'SourceComponentID',
                    'A component cannot be reused from itself — set SourceComponentID to the component this one was copied from, or leave it null.',
                    this.SourceComponentID,
                    ValidationErrorType.Failure
                )
            );
        }
        return errors;
    }

    /** `SlotName` is a position within a parent; a root component has no position to name. */
    private validateSlotName(): ValidationErrorInfo[] {
        if (this.SlotName && this.SlotName.trim().length > 0 && !this.ParentComponentID) {
            return [
                new ValidationErrorInfo(
                    'SlotName',
                    `SlotName '${this.SlotName}' was set on a component with no ParentComponentID. A slot is a fillable ` +
                        `position INSIDE a parent component — a root component does not occupy one. Set ParentComponentID, ` +
                        `or clear SlotName.`,
                    this.SlotName,
                    ValidationErrorType.Failure
                ),
            ];
        }
        return [];
    }

    /** Only load the type row when the type or the spec is actually changing. */
    private needsTypeCheck(): boolean {
        if (!this.ComponentTypeID) return false;
        if (!this.IsSaved) return true;
        return (this.GetFieldByName('ComponentTypeID')?.Dirty ?? false) || (this.GetFieldByName('Spec')?.Dirty ?? false);
    }

    /** Load the component type and apply the abstract-instantiation + SpecSchema rules. */
    private async validateAgainstType(): Promise<ValidationErrorInfo[]> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const type = await md.GetEntityObject<MJMLComponentTypeEntity>('MJ: ML Component Types', this.ContextCurrentUser);
        if (!(await type.Load(this.ComponentTypeID))) {
            return []; // dangling ComponentTypeID is the FK constraint's problem
        }
        if (type.IsAbstract) {
            return [
                new ValidationErrorInfo(
                    'ComponentTypeID',
                    `'${type.Name}' is an abstract component type — it exists to carry inherited properties for the ` +
                        `types beneath it, and has nothing to run. Instantiate one of its concrete descendants instead.`,
                    this.ComponentTypeID,
                    ValidationErrorType.Failure
                ),
            ];
        }
        return BuildComponentSpecValidationErrors(this.Spec, type.SpecSchema ?? null, type.Name);
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
 * PURE validation core for `Spec` ⊨ the component type's `SpecSchema` (exported for tests):
 *
 * - blank/null `specJson` → nothing to check (the type's `DefaultSpec` applies);
 * - unparseable / non-object `specJson` → one **Failure** (a spec is always an object);
 * - absent/blank `specSchemaJson` → freeform, no further checks;
 * - unparseable / non-object `specSchemaJson` → one **Warning** (a metadata bug on the TYPE row
 *   must not brick every instance of that type);
 * - schema violations → one **Failure** each, with the JSON-path-ish location.
 *
 * @param specJson the component's `Spec` JSON
 * @param specSchemaJson the type's `SpecSchema`, or null when unpublished
 * @param typeName the type's name, for readable messages
 */
export function BuildComponentSpecValidationErrors(
    specJson: string | null | undefined,
    specSchemaJson: string | null,
    typeName: string
): ValidationErrorInfo[] {
    if (specJson == null || specJson.trim().length === 0) return [];

    let spec: unknown;
    try {
        spec = JSON.parse(specJson);
    } catch (e) {
        return [
            new ValidationErrorInfo(
                'Spec',
                `Spec is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
                specJson,
                ValidationErrorType.Failure
            ),
        ];
    }
    if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
        return [
            new ValidationErrorInfo(
                'Spec',
                'Spec must be a JSON object — it is the component\'s keyed configuration, never an array or a scalar.',
                specJson,
                ValidationErrorType.Failure
            ),
        ];
    }

    if (specSchemaJson == null || specSchemaJson.trim().length === 0) {
        return []; // the type publishes no schema — the spec is freeform
    }

    let schema: unknown;
    try {
        schema = JSON.parse(specSchemaJson);
    } catch (e) {
        return [warnBadSchema(typeName, `it is not valid JSON (${e instanceof Error ? e.message : String(e)})`, specSchemaJson)];
    }
    if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
        return [warnBadSchema(typeName, 'it is not a JSON object', specSchemaJson)];
    }

    return ValidateJsonAgainstSchemaLite(spec, schema as Record<string, unknown>).map(
        (violation) =>
            new ValidationErrorInfo(
                'Spec',
                `Spec does not conform to the '${typeName}' component type's SpecSchema: ${violation}`,
                specJson,
                ValidationErrorType.Failure
            )
    );
}

/** A malformed SpecSchema is the type row's bug — warn, never block the instance being saved. */
function warnBadSchema(typeName: string, why: string, value: string): ValidationErrorInfo {
    return new ValidationErrorInfo(
        'Spec',
        `The '${typeName}' component type publishes a SpecSchema that cannot be used because ${why}. ` +
            `Spec was left unvalidated — fix the SpecSchema on the component type.`,
        value,
        ValidationErrorType.Warning
    );
}

/**
 * Tree-shaking guard — dynamic ClassFactory instantiation is invisible to the bundler, so this
 * keeps the registration alive.
 */
export function LoadMJMLComponentEntityServer(): void {
    // no-op
}
