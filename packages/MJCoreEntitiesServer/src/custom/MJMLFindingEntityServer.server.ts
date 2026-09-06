import { BaseEntity, SimpleEmbeddingResult, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJMLFindingEntity } from '@memberjunction/core-entities';
import { validateJsonColumn } from './MJMLComponentTypeEntityServer.server';
import { EmbedTextLocalHelper } from './util';

/**
 * Server-side ML Finding entity — one dated, measured fact the organization has learned about
 * itself.
 *
 * Findings are the durable residue of modeling: the model that produced one gets retrained and
 * replaced, but *"committee membership is associated with 31% lower lapse risk, measured 2026,
 * out-of-sample"* stays true of the business. Because they are meant to be **cited** — by agents,
 * in board papers, by the next person asking the same question — the integrity rules here are
 * about not letting a citation say more than the measurement supports.
 *
 *  1. **The story is searchable.** `StoryVector` is generated on save from the same prose a human
 *     reads, so *"what have we learned about lapsing?"* is a vector query rather than a report
 *     someone has to write. Same field pattern, same local embedding model, as component stories —
 *     a vector from a different model produces distances that look like numbers and mean nothing.
 *
 *  2. **A magnitude carries its unit.** `0.31` is a probability, a percentage, an odds ratio or an
 *     importance share depending on a column nobody looks at, and every one of those reads as a
 *     different claim. A number without its unit is worse than no number, so it is refused.
 *
 *  3. **A causal claim needs causal evidence.** `Direction` says which way the relationship runs;
 *     `EvidenceType` says what kind of knowledge that is. The pairing is checked, because the whole
 *     reason this table exists is that an agent will otherwise flatten *"members on a committee
 *     renew more often"* into *"putting members on a committee makes them renew"* — two claims
 *     separated by an entire research programme.
 *
 *  4. **A finding cannot supersede itself**, which would make the historical chain a loop and hide
 *     the movement it exists to show.
 */
@RegisterClass(BaseEntity, 'MJ: ML Findings')
export class MJMLFindingEntityServer extends MJMLFindingEntity {
    /** Generate the story embedding, then save. */
    public override async Save(): Promise<boolean> {
        await this.GenerateEmbeddingsByFieldName([
            { fieldName: 'Story', vectorFieldName: 'StoryVector', modelFieldName: 'StoryEmbeddingModelID' },
        ]);
        return super.Save();
    }

    /** @inheritdoc */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        for (const error of [
            ...validateJsonColumn('Evidence', this.Evidence),
            ...this.validateMagnitudeUnit(),
            ...this.validateEvidenceSupportsDirection(),
            ...this.validateSupersession(),
        ]) {
            result.Errors.push(error);
        }
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /** A magnitude with no unit cannot be read; a unit with no magnitude describes nothing. */
    private validateMagnitudeUnit(): ValidationErrorInfo[] {
        const hasUnit = (this.MagnitudeUnit ?? '').trim().length > 0;
        if (this.Magnitude != null && !hasUnit) {
            return [
                new ValidationErrorInfo(
                    'MagnitudeUnit',
                    `A Magnitude of ${this.Magnitude} was recorded with no MagnitudeUnit. The same number reads as a ` +
                        `probability, a percentage, an odds ratio or an importance share depending on the unit, and a ` +
                        `reader has no way to tell which was meant. Name the unit, or clear the magnitude.`,
                    this.MagnitudeUnit,
                    ValidationErrorType.Failure
                ),
            ];
        }
        if (this.Magnitude == null && hasUnit) {
            return [
                new ValidationErrorInfo(
                    'Magnitude',
                    `MagnitudeUnit '${this.MagnitudeUnit}' was set with no Magnitude to apply it to.`,
                    this.Magnitude,
                    ValidationErrorType.Failure
                ),
            ];
        }
        return [];
    }

    /**
     * `Descriptive` states a property of the population — it claims no relationship, so it cannot
     * carry a direction. Everything else may.
     *
     * Note what is deliberately NOT enforced: an `Observed Association` is allowed to say
     * `Increases`. Associations do have directions, and refusing that would push writers toward
     * `Unknown` — losing real information to protect against a misreading. The guard against the
     * misreading is `EvidenceType` being on every citation, not a missing direction.
     */
    private validateEvidenceSupportsDirection(): ValidationErrorInfo[] {
        const directional = this.Direction && this.Direction !== 'Unknown' && this.Direction !== 'None';
        if (this.EvidenceType === 'Descriptive' && directional) {
            return [
                new ValidationErrorInfo(
                    'Direction',
                    `A Descriptive finding states a property of the population and claims no relationship, so ` +
                        `Direction '${this.Direction}' has nothing to point at. Either name what it relates to and ` +
                        `record it as an Observed Association, or leave Direction as 'None'.`,
                    this.Direction,
                    ValidationErrorType.Failure
                ),
            ];
        }
        return [];
    }

    /**
     * Proxy to the shared embedding helper (required by `BaseEntity`'s embedding support).
     *
     * Without this override `BaseEntity.EmbedTextLocal` throws, `GenerateEmbedding` swallows the
     * throw, and every finding saves with a NULL `StoryVector` — present in the table and invisible
     * to every search. The failure is silent by construction, which is why it is worth naming here.
     */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }

    /** A finding cannot supersede itself — the chain would loop and hide the movement it records. */
    private validateSupersession(): ValidationErrorInfo[] {
        if (this.ID && this.SupersededByID && this.SupersededByID.toLowerCase() === this.ID.toLowerCase()) {
            return [
                new ValidationErrorInfo(
                    'SupersededByID',
                    'A finding cannot be superseded by itself. Point it at the newer measurement, or leave it null.',
                    this.SupersededByID,
                    ValidationErrorType.Failure
                ),
            ];
        }
        return [];
    }
}
