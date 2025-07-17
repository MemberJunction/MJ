import { BaseEntity, EntityInfo, RunQueryParams, RunQueryResult, RunViewParams, RunViewResult } from "@memberjunction/core";

/**
 * This is a simple data context object that is passed into the ComponentInitFunction containing any required `static` data. This object is empty when the mode is `dynamic`  
 */
export type SimpleDataContext = {
    [key: string]: any;
}

/**
 * Access system metadata and get entity objects to do CRUD operations on entities.
 */
export interface SimpleMetadata {
    /**
     * Array of entity metadata objects that describe the entities in the system.
     */
    Entities: EntityInfo[];
    /**
     * Retrieves a single BaseEntity derived class for the specified entity
     * @param entityName 
     */
    GetEntityObject(entityName: string): Promise<BaseEntity>;
}

/**
* Simple interface for running views in MJ
 */
export interface SimpleRunView {
    /**
     * Run a single view and return the results. The view is run dynamically against the MemberJunction host environment.
     * @param params 
     * @returns 
     */
    RunView: (params: RunViewParams) => Promise<RunViewResult>
    /**
     * Runs multiple views and returns the results. This is efficient for running views in **parallel**.
     * @param params 
     * @returns 
     */
    RunViews: (params: RunViewParams[]) => Promise<RunViewResult[]>
}

/**
 * Simple interface for running predefined queries in MJ
 */
export interface SimpleRunQuery {
    /**
     * Run a single predefined query.
     * @param params 
     * @returns 
     */
    RunQuery: (params: RunQueryParams) => Promise<RunQueryResult>
}