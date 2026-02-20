import { BaseEntity, EntitySaveOptions, LogError, Metadata, RunView, IMetadataProvider } from "@memberjunction/core";
import { RegisterClass, MJGlobal } from "@memberjunction/global";
import { MJAIPromptRunEntityExtended } from "@memberjunction/ai-core-plus";
import { AIEngineBase, BasePriceUnitType } from "@memberjunction/ai-engine-base";

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
        const f = this.Fields.find(f => f.Name === 'CompletedAt');
        const completedAtChanged = !this.IsSaved || f.Dirty;
        
        if (!completedAtChanged) {
            return false;
        }
        
        // Don't recalculate if cost is already set
        if (this.Cost != null && this.Cost > 0) {
            return false;
        }
        
        // Must have token usage to calculate (at least one token field > 0)
        if (!this.TokensPrompt || !this.TokensCompletion || 
            (this.TokensPrompt <= 0 && this.TokensCompletion <= 0)) {
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
            
            // Get the active cost configuration
            const activeCost = AIEngineBase.Instance.GetActiveModelCost(
                this.ModelID, 
                this.VendorID,
                'Realtime' // For now, assume all prompt runs are realtime
            );
            
            if (!activeCost) {
                LogError(`No active cost configuration found for Model: ${this.ModelID}, Vendor: ${this.VendorID}`);
                return;
            }
            
            // Get the price unit type to understand the normalization
            const priceUnitType = AIEngineBase.Instance.ModelPriceUnitTypes.find(
                put => put.ID === activeCost.UnitTypeID
            );
            
            if (!priceUnitType) {
                LogError(`Price unit type not found: ${activeCost.UnitTypeID}`);
                return;
            }
            
            // Calculate costs using the driver class
            const priceCalculator = MJGlobal.Instance.ClassFactory.CreateInstance<BasePriceUnitType>(
                BasePriceUnitType,
                priceUnitType.DriverClass
            );
            
            if (!priceCalculator) {
                LogError(`Failed to create price calculator for driver class: ${priceUnitType.DriverClass}`);
                return;
            }
            
            const normalizedCost = priceCalculator.CalculateNormalizedCost(
                activeCost,
                this.TokensPrompt,
                this.TokensCompletion
            );
            
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