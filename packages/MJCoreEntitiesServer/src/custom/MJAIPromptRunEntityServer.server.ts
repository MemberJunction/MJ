import { BaseEntity, EntitySaveOptions, LogError, Metadata, RunView, IMetadataProvider } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { ModelUsageUnitKind } from "@memberjunction/ai";
import { MJAIPromptRunEntityExtended } from "@memberjunction/ai-core-plus";
import { AIEngineBase, BasePriceUnitType, NormalizedUsage } from "@memberjunction/ai-engine-base";

/**
 * What a prompt run recorded about the work it did, in whichever measure applies.
 *
 * Token counts and continuous units are both present because they are not alternatives at the
 * schema level — the usage type is what says which pair is meaningful.
 *
 * Carried as the measure NAME, not as `UsageTypeID`. The pricing drivers are keyed on the measure
 * (`ModelUsageUnitKind`); resolving the foreign key once, here at the storage boundary, keeps every
 * pure function below independent of how the catalog is persisted — and keeps them testable without
 * a loaded engine.
 */
export type RecordedRunUsage = {
    tokensPrompt: number;
    tokensCacheRead: number;
    tokensCacheWrite: number;
    tokensCompletion: number;
    /**
     * Null means a set `UsageTypeID` could not be resolved against the loaded catalog — never an
     * unset column, which is read as `Tokens` before this type is built; see `RecordedUsage`.
     */
    unitsKind: ModelUsageUnitKind | null;
    inputUnits: number;
    outputUnits: number;
};

/** Either the quantities to price, or the reason they cannot be priced. */
export type NormalizeUsageResult =
    | { ok: true; usage: NormalizedUsage }
    | { ok: false; reason: string };

/**
 * Whether a run recorded any work at all worth pricing.
 *
 * Token input is the TOTAL the provider processed: net-new plus cache reads plus cache writes. A
 * heavily-cached call can have zero net-new prompt tokens and still incur input cost, so the gate
 * is on the total rather than net-new alone. Continuous-media runs legitimately record zero tokens
 * — their work is measured in seconds or images — so units count as usage too.
 */
export function hasRecordedUsage(recorded: RecordedRunUsage): boolean {
    const totalInputTokens = recorded.tokensPrompt + recorded.tokensCacheRead + recorded.tokensCacheWrite;
    const totalUnits = recorded.inputUnits + recorded.outputUnits;
    return totalInputTokens > 0 || recorded.tokensCompletion > 0 || totalUnits > 0;
}

/**
 * Maps a run's recorded usage onto the quantities a driver of `driverUnitKind` prices, refusing
 * when the two disagree about what is being measured.
 *
 * The refusal matters: a transcription run measured in seconds, handed to a per-1M-tokens driver,
 * would be priced by dividing seconds by a million — a cost of approximately zero that looks like
 * a real answer. Refusing surfaces the misconfigured cost row instead of hiding it behind a number.
 */
export function normalizeRecordedUsage(
    recorded: RecordedRunUsage,
    driverUnitKind: ModelUsageUnitKind
): NormalizeUsageResult {
    // Units whose measure could not be RESOLVED name nothing: nothing says what they are counted in,
    // so there is no driver they can honestly be handed to. This is not "the producer forgot to set
    // it" — an unset column is read as Tokens at the storage seam and caught by the next guard — it
    // is an id absent from the loaded catalog: a deleted row or a stale cache. Falling through would
    // treat them as Tokens and price the run's (zero) token counts, writing Cost = 0 for billed work.
    if (recorded.unitsKind == null && (recorded.inputUnits > 0 || recorded.outputUnits > 0)) {
        return {
            ok: false,
            reason: `run recorded ${recorded.inputUnits} input / ${recorded.outputUnits} output units but no ` +
                `resolvable usage type, so there is no measure to price them in`
        };
    }

    const recordedKind: ModelUsageUnitKind = recorded.unitsKind ?? 'Tokens';

    // "The producer never said what these units are" and "the producer said they are tokens" arrive
    // here as the same value, because an unset `UsageTypeID` is read as Tokens at the storage seam.
    // Both are refused for the same reason: units counted in anything are not token
    // counts — `TokensPrompt`/`TokensCompletion` carry those — so populated units against the Tokens
    // measure is a contradiction, not a quantity to price.
    //
    // Why it is reachable at all, given the measure-filtered row selection: for a model whose only
    // active row is media-priced, selection finds no Tokens-priced row and the run is refused with a
    // logged reason — safe. But a model carrying an active token row ALONGSIDE a media one selects
    // the token row, matches measures (both say Tokens), normalizes the token buckets to
    // {0, 0, 0, 0}, and persists Cost = 0 against a run that recorded thousands of units of billed
    // work. No shipped model+vendor pair carries two measures today, so it cannot occur on current
    // data — and the deferred image-generation work is exactly where multi-measure models arrive.
    if (recordedKind === 'Tokens' && (recorded.inputUnits > 0 || recorded.outputUnits > 0)) {
        return {
            ok: false,
            reason: `run recorded ${recorded.inputUnits} input / ${recorded.outputUnits} output units against the ` +
                `Tokens measure, which counts tokens rather than units; set UsageTypeID to the measure they were ` +
                `actually counted in`
        };
    }

    // The mirror of the check above, and the same defect through the other side: a kind with no
    // quantity. `hasRecordedUsage` is satisfied by token counts alone, so a run naming `Seconds`
    // that reports zero seconds reaches here, normalizes to {input: 0, output: 0}, and persists
    // `Cost = 0` — "free" written against work that was billed. This is the path that actually
    // WRITES the column, so the guard has to be here and not only on the standalone costing
    // surface; a run that gets this far has already declared a non-token measure, so a zero
    // quantity is a producer that set the kind and forgot the amount.
    if (recordedKind !== 'Tokens' && recorded.inputUnits === 0 && recorded.outputUnits === 0) {
        return {
            ok: false,
            reason: `run recorded usage in ${recordedKind} but no unit quantity, so there is nothing to ` +
                `price; refusing rather than recording a cost of 0`
        };
    }

    if (driverUnitKind !== recordedKind) {
        return {
            ok: false,
            reason: `run recorded usage in ${recordedKind} but its cost row is priced in ${driverUnitKind}` +
                `; correct the cost row's unit type`
        };
    }

    if (recordedKind === 'Tokens') {
        return {
            ok: true,
            usage: {
                input: recorded.tokensPrompt,
                output: recorded.tokensCompletion,
                cacheRead: recorded.tokensCacheRead,
                cacheWrite: recorded.tokensCacheWrite
            }
        };
    }

    return { ok: true, usage: { input: recorded.inputUnits, output: recorded.outputUnits } };
}

/**
 * Server-side subclass for MJAIPromptRunEntity that automatically calculates costs
 * when a prompt run is completed or errors out. The cost calculation is based on
 * the active pricing configuration for the model and vendor used in the run.
 * 
 * Now extends MJAIPromptRunEntityExtended to inherit message parsing capabilities.
 */
@RegisterClass(BaseEntity, "MJ: AI Prompt Runs")
export class MJAIPromptRunEntityServer extends MJAIPromptRunEntityExtended {
    
    /**
     * Override Save to calculate costs when status changes to Complete or Error
     */
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            // Check if we need to calculate costs
            const shouldCalculateCost = this.ShouldCalculateCost();
            
            if (shouldCalculateCost) {
                await this.CalculateAndSetCost();
            }

            // always update our TotalCost in case cost or descendant cost changed
            this.UpdateTotalCost();
            
            // Now save the entity with the calculated costs
            const result = await super.Save(options);
            
            // If save was successful and this is a child prompt run with costs, trigger parent rollup
            // only do it if we have just calculated costs
            if (result && shouldCalculateCost && this.ParentID && this.Cost != null) {
                await this.TriggerParentCostRollup();
            }
            
            return result;
        }
        catch (err) {
            LogError(`Error in MJAIPromptRunEntityServer.Save: ${err}`);
            throw err;
        }
    }
    
    /**
     * Determines if we should calculate costs for this run
     * @returns true if costs should be calculated
     */
    protected ShouldCalculateCost(): boolean {
        // Only calculate if we have a CompletedAt timestamp
        if (!this.CompletedAt) {
            return false;
        }
        
        // Check if CompletedAt was just set (either new record or just changed)
        // For existing records, check if any fields have changed
        const f = this.GetFieldByName('CompletedAt');
        const completedAtChanged = !this.IsSaved || f?.Dirty;
        
        if (!completedAtChanged) {
            return false;
        }
        
        // Don't recalculate if cost is already set
        if (this.Cost != null && this.Cost > 0) {
            return false;
        }
        
        // Must have recorded usage of SOME kind — tokens for an LLM run, seconds or images for a
        // continuous-media one. Gating on tokens alone is what left media runs silently uncosted.
        if (!hasRecordedUsage(this.RecordedUsage())) {
            return false;
        }
        
        // Must have model and vendor information
        if (!this.ModelID || !this.VendorID) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Calculates the cost for this prompt run based on token usage and active pricing
     */
    protected async CalculateAndSetCost(): Promise<void> {
        try {
            // Ensure AI metadata is loaded
            await AIEngineBase.Instance.Config(false, this.ContextCurrentUser);
            
            // Select the cost row by the measure this run actually recorded, not just by
            // model+vendor: a model with rows in two measures would otherwise hand back whichever
            // started most recently and be refused below, reporting a measure mismatch where the
            // real answer was "pick the other row".
            const recorded = this.RecordedUsage();
            const activeCost = AIEngineBase.Instance.GetActiveModelCost(
                this.ModelID,
                this.VendorID,
                'Realtime', // For now, assume all prompt runs are realtime
                recorded.unitsKind ?? 'Tokens'
            );

            if (!activeCost) {
                LogError(
                    `No active cost configuration priced in ${recorded.unitsKind ?? 'Tokens'} found for ` +
                    `Model: ${this.ModelID}, Vendor: ${this.VendorID}`
                );
                return;
            }

            // Resolve the calculator the cost row's unit type names (logs and returns null when
            // the unit type or its driver class is missing)
            const priceCalculator = AIEngineBase.Instance.GetPriceCalculator(activeCost);
            if (!priceCalculator) {
                return;
            }

            const usage = this.BuildNormalizedUsage(priceCalculator, recorded);
            if (!usage) {
                return;
            }

            // Token pricing prices each input bucket at its own rate: uncached/net-new (TokensPrompt)
            // at the standard input rate, cache reads/writes at CacheReadPricePerUnit /
            // CacheWritePricePerUnit when the cost row records them. When those cache rates are NULL
            // the calculator falls back to the input rate, so the result is identical to the prior
            // single-bucket behavior for models without cache pricing — while models that DO have
            // cache rates get the (usually much cheaper) cached-token cost instead of being billed as
            // full input. Continuous-media pricing ignores the cache buckets entirely.
            const normalizedCost = priceCalculator.CalculateCost(activeCost, usage);

            // Set the cost fields
            this.Cost = normalizedCost;
            this.CostCurrency = activeCost.Currency;
            
            // Update total cost (for leaf nodes, total = cost)
            if (!this.ParentID) {
                // This is a root prompt run, so total cost = cost
                this.TotalCost = normalizedCost;
            }
            // For child nodes, TotalCost will be calculated during rollup
            
        } catch (err) {
            LogError(`Error calculating cost for AIPromptRun ${this.ID}: ${err}`);
            // Don't throw - we don't want to prevent saving just because cost calc failed
        }
    }

    /**
     * This run's recorded usage, with nulls collapsed to zero for the pure helpers above.
     *
     * `UsageTypeID` is resolved to its measure NAME here, through the engine's cached catalog, so
     * the pure functions never see a foreign key. This is the ONE seam that reads an unset column
     * as `Tokens`, and it is the only place allowed to: the column is nullable until the release
     * after the AI Usage Types seed ships, and every row written before it existed was token-billed
     * — the schema had no way to say anything else.
     *
     * A SET id that the catalog does not contain is a different situation and stays null: that is a
     * real fault — a stale cache or a deleted row — so it is logged, and `normalizeRecordedUsage`
     * refuses to price units recorded against it. Collapsing the two would price seconds as tokens
     * and write a confident zero.
     */
    protected RecordedUsage(): RecordedRunUsage {
        const usageTypeName = this.UsageTypeID ? AIEngineBase.Instance.UsageTypeName(this.UsageTypeID) : 'Tokens';
        if (usageTypeName === null) {
            LogError(
                `AIPromptRun ${this.ID} references usage type ${this.UsageTypeID}, which is not in the ` +
                `loaded catalog; its units cannot be priced.`
            );
        }
        return {
            tokensPrompt: this.TokensPrompt ?? 0,
            tokensCacheRead: this.TokensCacheRead ?? 0,
            tokensCacheWrite: this.TokensCacheWrite ?? 0,
            tokensCompletion: this.TokensCompletion ?? 0,
            unitsKind: usageTypeName as ModelUsageUnitKind | null,
            inputUnits: this.InputUnitsUsed ?? 0,
            outputUnits: this.OutputUnitsUsed ?? 0
        };
    }

    /**
     * Turns this run's recorded usage into the quantities the resolved calculator prices, or null
     * (having logged why) when the two disagree about what is being measured.
     *
     * Takes the recorded usage as a parameter rather than re-reading it: `CalculateAndSetCost` needs
     * the measure BEFORE it can select a cost row, and `RecordedUsage` logs when a `UsageTypeID`
     * fails to resolve — calling it twice would report the same fault twice for one save.
     */
    protected BuildNormalizedUsage(
        priceCalculator: BasePriceUnitType,
        recorded: RecordedRunUsage = this.RecordedUsage()
    ): NormalizedUsage | null {
        const result = normalizeRecordedUsage(recorded, priceCalculator.UnitKind);
        if (result.ok === false) {
            LogError(`Cannot cost AIPromptRun ${this.ID}: ${result.reason}.`);
            return null;
        }
        return result.usage;
    }

    /**
     * Triggers cost rollup calculation on the parent prompt run
     */
    protected async TriggerParentCostRollup(): Promise<void> {
        try {
            // Load the parent prompt run using entity's provider
            const md = this.ProviderToUse as any as IMetadataProvider;
            const parent = await md.GetEntityObject<MJAIPromptRunEntityServer>(
                'MJ: AI Prompt Runs',
                this.ContextCurrentUser
            );
            
            if (await parent.Load(this.ParentID)) {
                // Recalculate the parent's total cost
                await parent.RecalculateTotalCost();
                await parent.Save();
            }
        } catch (err) {
            LogError(`Error triggering parent cost rollup: ${err}`);
        }
    }
    
    /**
     * Recalculates the descendant cost for this prompt run by summing all child total costs.
     * This method queries all direct children and sums their TotalCost values to determine
     * this run's DescendantCost. The TotalCost is automatically updated via the setter.
     */
    public async RecalculateTotalCost(): Promise<void> {
        try {
            // Initialize descendant cost to zero
            let descendantCost = 0;
            
            // Get all child runs
            const rv = this.RunViewProviderToUse;
            const childRuns = await rv.RunView({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: `ParentID = '${this.ID}'`,
                ResultType: 'simple'
            }, this.ContextCurrentUser);
            
            if (childRuns.Success && childRuns.Results) {
                // Sum up all child total costs
                for (const child of childRuns.Results) {
                    if (child.TotalCost != null) {
                        descendantCost += Number(child.TotalCost);
                    }
                }
            }
            
            // Update our descendant cost
            this.DescendantCost = descendantCost;            
        } catch (err) {
            LogError(`Error recalculating total cost for prompt run ${this.ID}: ${err}`);
        }
    }

    /**
     * Override setter for DescendantCost to automatically update TotalCost whenever it changes.
     * This ensures TotalCost always reflects the sum of Cost + DescendantCost.
     * @param value The new descendant cost value
     */
    public set DescendantCost(value: number) {
        super.DescendantCost = value; // call the base class setter
        this.UpdateTotalCost(); // update total cost
    }
    // need both getters and setters to ensure consistency
    public get DescendantCost(): number {
        return super.DescendantCost; // call the base class getter
    }

    /**
     * Override setter for Cost to automatically update TotalCost whenever it changes.
     * This ensures TotalCost always reflects the sum of Cost + DescendantCost.
     * @param value The new cost value for this run
     */
    public set Cost(value: number) {
        super.Cost = value; // call the base class setter
        this.UpdateTotalCost(); // update total cost
    }
    // need both getters and setters to ensure consistency
    public get Cost(): number {
        return super.Cost; // call the base class getter
    }
    /**
     * Updates the TotalCost field by summing Cost and DescendantCost.
     * This method is called automatically by the Cost and DescendantCost setters
     * to maintain consistency. Handles null values by treating them as zero.
     * @protected
     */
    protected UpdateTotalCost(): void {
        const descendantCost = this.DescendantCost || 0;
        const cost = this.Cost || 0;
        this.TotalCost = descendantCost + cost; // update total cost
    }
}