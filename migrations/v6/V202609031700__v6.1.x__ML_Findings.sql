/**************************************************************************************************
 * Migration: Predictive Studio — findings as first-class records
 *
 * A trained model is the PERISHABLE part of the exercise: it gets retrained, replaced, retired.
 * What it LEARNED is durable — "committee membership is associated with 31% lower lapse risk,
 * measured 2026, out-of-sample" is true of the business, not of the artifact, and outlives every
 * model that ever measured it.
 *
 * Today that fact lives only inside the model's own story, which is overwritten at the next
 * retrain. The most durable thing modelling produces is the thing this platform persists least
 * well. This table fixes that.
 *
 * Three design decisions carry the weight:
 *
 *   1. EvidenceType is NOT optional. An observed association and a tested intervention are
 *      different claims, and an agent asked "what drives renewal?" will flatten them into one
 *      sentence unless the record forces the distinction. "Members on a committee renew more
 *      often" and "putting members on a committee makes them renew more often" differ by an entire
 *      research programme; a citation that loses that difference is worse than no citation.
 *
 *   2. Findings are SUPERSEDED, never updated. Each measurement is a dated row; a retrain writes a
 *      new one and points the old one at it. Updating in place would destroy the only thing that
 *      can show a business lever SHIFTING over years — which is the whole reason to keep them.
 *
 *   3. Story/StoryVector mirror MLComponent exactly, so findings are searchable by meaning through
 *      the same path signals already are. "What have we learned about lapsing?" is then a vector
 *      query, not a report someone has to write.
 *
 * Schema/DDL only. CodeGen generates the Entity/EntityField metadata, __mj_CreatedAt/__mj_UpdatedAt,
 * foreign-key indexes (IDX_AUTO_MJ_FKEY_*), the base view and the CRUD stored procedures after this
 * migration runs.
 *
 * PostgreSQL counterpart: deferred to the release build per migrations/CLAUDE.md (the build
 * engineer converts the whole release's DDL in one pass).
 *
 * Version: 6.1.x
 **************************************************************************************************/

CREATE TABLE ${flyway:defaultSchema}.[MLFinding] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Statement] NVARCHAR(MAX) NOT NULL,
    [MLModelID] UNIQUEIDENTIFIER NULL,
    [ComponentID] UNIQUEIDENTIFIER NULL,
    [TargetVariable] NVARCHAR(255) NULL,
    [EvidenceType] NVARCHAR(30) NOT NULL,
    [Direction] NVARCHAR(20) NOT NULL DEFAULT 'Unknown',
    [Magnitude] DECIMAL(18, 6) NULL,
    [MagnitudeUnit] NVARCHAR(50) NULL,
    [Confidence] NVARCHAR(20) NULL,
    [MeasuredAt] DATETIMEOFFSET NOT NULL,
    [PopulationSize] INT NULL,
    [HoldoutMetric] NVARCHAR(50) NULL,
    [HoldoutMetricValue] DECIMAL(18, 6) NULL,
    [Evidence] NVARCHAR(MAX) NULL,
    [Story] NVARCHAR(MAX) NULL,
    [StoryVector] NVARCHAR(MAX) NULL,
    [StoryEmbeddingModelID] UNIQUEIDENTIFIER NULL,
    [ContentHash] NVARCHAR(64) NULL,
    [SupersededByID] UNIQUEIDENTIFIER NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT [PK_MLFinding] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MLFinding_MLModel] FOREIGN KEY ([MLModelID])
        REFERENCES ${flyway:defaultSchema}.[MLModel]([ID]),
    CONSTRAINT [FK_MLFinding_Component] FOREIGN KEY ([ComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]),
    CONSTRAINT [FK_MLFinding_StoryEmbeddingModel] FOREIGN KEY ([StoryEmbeddingModelID])
        REFERENCES ${flyway:defaultSchema}.[AIModel]([ID]),
    CONSTRAINT [FK_MLFinding_SupersededBy] FOREIGN KEY ([SupersededByID])
        REFERENCES ${flyway:defaultSchema}.[MLFinding]([ID]),
    CONSTRAINT [CK_MLFinding_EvidenceType] CHECK ([EvidenceType] IN (
        'Observed Association', 'Predictive Contribution', 'Tested Intervention', 'Descriptive', 'Asserted')),
    CONSTRAINT [CK_MLFinding_Direction] CHECK ([Direction] IN ('Increases', 'Decreases', 'Mixed', 'None', 'Unknown')),
    CONSTRAINT [CK_MLFinding_Confidence] CHECK ([Confidence] IS NULL OR [Confidence] IN ('Low', 'Moderate', 'High')),
    CONSTRAINT [CK_MLFinding_Status] CHECK ([Status] IN ('Active', 'Superseded', 'Retracted')),
    CONSTRAINT [CK_MLFinding_Evidence_JSON] CHECK ([Evidence] IS NULL OR ISJSON([Evidence]) = 1),
    CONSTRAINT [CK_MLFinding_PopulationSize] CHECK ([PopulationSize] IS NULL OR [PopulationSize] > 0)
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A dated, measured fact this organization has learned about itself — the durable residue of modeling. A model is perishable (retrained, replaced, retired); what it LEARNED is not, and belongs to the business rather than to the artifact that measured it. Findings are written when a model is promoted, from its measured importances and coefficients, and are SUPERSEDED rather than updated so the record shows a lever shifting over time instead of only its latest value. Story/StoryVector make them searchable by meaning exactly as MJ: ML Components are, so "what have we learned about lapsing?" is a vector query rather than a report someone has to write. EXAMPLE: "Committee membership is associated with 31% lower lapse risk" — EvidenceType Observed Association, Direction Decreases, Magnitude 0.31, measured out-of-sample on 2,180 members.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Short label naming the relationship, for lists and citations (e.g. "Committee membership and lapse risk"). The full claim lives in Statement.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The claim in one plain sentence, written so it can be quoted verbatim into a board paper or an agent''s answer without further interpretation. Must carry its own hedging: an association says "is associated with", never "causes".', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'Statement';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The model whose promotion produced this measurement. NULL for a finding recorded independently of any model (an operator''s asserted domain fact, or one carried over from an external study).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'MLModelID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The signal (MJ: ML Components row) this finding is about — the measure whose contribution was quantified. This is what lets a finding be re-tested later: the signal is executable, so the same measurement can be repeated on new data.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'ComponentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What the finding is a claim ABOUT — the outcome the relationship was measured against (e.g. "Renewed", "Lapsed", "DonationAmount"). Denormalized from the model so a finding stays legible after the model is archived.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'TargetVariable';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'THE EPISTEMIC STATUS, and the most important column here. Observed Association = the two move together in the data. Predictive Contribution = this input measurably improved out-of-sample prediction (a stronger statement about usefulness, still not about cause). Tested Intervention = something was deliberately changed and the effect measured — the only kind that supports "if we do X, Y follows". Descriptive = a stated property of the population, no relationship claimed. Asserted = a human recorded it without measurement here. An agent citing a finding must not flatten these into one voice, which is exactly what it will do if the distinction is not on the record.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'EvidenceType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which way the relationship runs with respect to TargetVariable: Increases, Decreases, Mixed (non-monotonic — more is better up to a point), None (measured and found not to matter, worth keeping so the next person does not re-test it), or Unknown.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'Direction';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How large the effect is, in the units named by MagnitudeUnit. NULL when the finding is directional only — an honest NULL beats a number nobody can interpret.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'Magnitude';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What Magnitude is measured in, so a number is never read in the wrong scale: "probability", "percent", "ratio", "odds ratio", "days", "importance share", or a domain unit. Required whenever Magnitude is present.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'MagnitudeUnit';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How much weight to put on this finding — Low, Moderate or High — reflecting population size, out-of-sample performance and how directly the effect was measured. Deliberately coarse: a spurious decimal here would invite false precision about something that is a judgment.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'Confidence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the measurement was taken. A finding without a date is not citable — the business changes, and a 2024 relationship is evidence about 2024. Ordering by this column over a chain of superseded findings is how a lever''s movement becomes visible.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'MeasuredAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How many records the measurement rested on. The difference between a finding worth acting on and one worth re-testing is usually this number.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'PopulationSize';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which out-of-sample metric backs this finding (e.g. "auc", "r2", "accuracy") — named rather than assumed, because the same number means different things across problem types.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'HoldoutMetric';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The value of HoldoutMetric on the LOCKED holdout — data the model never saw. This is what separates a finding from a story: the relationship held on records that played no part in discovering it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'HoldoutMetricValue';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The numbers behind the claim, as JSON — importance share, coefficient, the holdout metric set, the assembly window, whatever the writer had. Kept so a skeptical reader can check the arithmetic rather than take the sentence on trust.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'Evidence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The finding in business language — what it means and what someone might do about it — written at promotion time. This is the text that gets embedded, so it is what a meaning search actually matches against.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'Story';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Embedding vector of Story (JSON float array), for similarity search over what the organization has learned. Written by the entity server on save when Story changes, using the same local model that embeds component stories — a vector from a different model produces distances that look like numbers and mean nothing.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'StoryVector';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which AI model produced StoryVector, so a later re-embedding can tell whether the corpus is still in one vector space.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'StoryEmbeddingModelID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Hash of the claim''s identity (signal + target + evidence type), so a retrain that re-measures the SAME relationship supersedes the prior finding instead of accumulating a near-duplicate beside it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'ContentHash';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The newer measurement of this same relationship. Set when a retrain re-measures it; the old row stays, dated, so the chain shows how the relationship moved rather than only where it ended up.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'SupersededByID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active (the current measurement), Superseded (a newer one exists — kept for the historical chain), or Retracted (found to be wrong; kept deliberately, because a retracted finding someone already acted on is itself worth knowing about).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLFinding', @level2type=N'COLUMN', @level2name=N'Status';
GO
