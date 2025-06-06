import { RunQueryParams, RunQueryResult, RunViewParams, RunViewResult } from "@memberjunction/core";
import { SkipEntityInfo } from "./entity-metadata-types";

/**
 * This is a simple data context object that is passed into the SkipComponentInitFunction, it contains a property for each of the data context items and typically are named
 * data_item_1, data_item_2, etc. The data context is a simple JavaScript object that contains properties that are in turn data objects which are typically arrays of things, but can be anything.
 */
export type SimpleDataContext = {
    [key: string]: any;
}

/**
 * Simple version of the @interface Metadata MemberJunction object that is passed to the Skip component.
 */
export interface SimpleMetadata {
    entities: SkipEntityInfo[]
}

/**
* Simple interface for running views in MemberJunction that can be used by components generated by Skip
 */
export interface SimpleRunView {
    /**
     * Run a single view and return the results. The view is run dynamically against the MemberJunction host environment.
     * @param params 
     * @returns 
     */
    runView: (params: RunViewParams) => Promise<RunViewResult>
    /**
     * Runs multiple views and returns the results. This is useful for running multiple views in parallel and returning the results in a single call.
     * @param params 
     * @returns 
     */
    runViews: (params: RunViewParams[]) => Promise<RunViewResult[]>
}

/**
 * Simple interface for running predefined queries in MemberJunction that can be used by components generated by Skip
 */
export interface SimpleRunQuery {
    /**
     * Run a single predefined query and return the results. The query is run dynamically against the MemberJunction host environment.
     * @param params 
     * @returns 
     */
    runQuery: (params: RunQueryParams) => Promise<RunQueryResult>
}
