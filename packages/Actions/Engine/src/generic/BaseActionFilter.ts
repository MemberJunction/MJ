import { MJActionFilterEntity } from "@memberjunction/core-entities";
import { RunActionParams } from "@memberjunction/actions-base";

/**
 * This is the base class for executing filters to determine if an action should be run. The CodeGen tool generates sub-classes of this class for each Action Filter in the system. The code injected into the
 * auto-generated sub-classes will implement the InternalRunFilter method which is called by this base class. If you would like to use code generation for your Action Filter, but modify the logic for executing
 * the filter you can sub-class the auto-generated sub-class. For this second level sub-class, you should use the @RegisterClass decorator from the @memberjunction/global package to register your subclass with 
 * the ClassFactory so that it will be used instead of the auto generated sub-class. This is the same pattern as how you would insert custom logic into a custom sub-class of BaseEntity.
 */
export abstract class BaseActionFilter {
    /**
     * Runs the filter logic for the given filter and params and returns true if the filter condition is met, false otherwise.
     */
    public async Run(params: RunActionParams, filter: MJActionFilterEntity): Promise<boolean> {
        // run the filter logic which is implemented in the sub-class. The reason we have a wrapper for the InternalRun function
        // is so that we can implement anything else, over time, that we want to do across all sub-classes via this base class method.
        return this.InternalRun(params, filter); 
    }

    /**
     * This method is implemented by the auto-generated sub-class for this filter. In the auto-generated sub-classes for each Action Filter,
     * the CodeGen tool will implement this method and insert into it the logic for the filter.
     */
    protected abstract InternalRun(params: RunActionParams, filter: MJActionFilterEntity): Promise<boolean>;
}