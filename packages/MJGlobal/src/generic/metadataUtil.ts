import { IMetadataProvider } from "./interfaces";
import { Metadata } from "./metadata";

/**
 * This function is used to get the entity name from the schema.view string
 * @param schemaAndView - this string contains the combined schema name and base view name, for example: "dbo.vwMyView"
 * @param provider - optional, if you want to use a different provider than the default one
 */
export function GetEntityNameFromSchemaAndViewString(schemaAndView: string, provider?: IMetadataProvider): string | null {
    const p = provider || new Metadata();
    // check to see if the view has a . in it, that would mean it has schema and view name, SHOULD always have that
    let schema = '', view = '';
    if (schemaAndView.indexOf('.') === -1) {
        view = schemaAndView.trim().toLowerCase();
    } 
    else {
        schema = schemaAndView.split('.')[0].trim().toLowerCase();
        view = schemaAndView.split('.')[1].trim().toLowerCase();
    }
    const e = p.Entities.filter(
        (x) => x.BaseView.trim().toLowerCase() === view && (schema === '' || x.SchemaName.trim().toLowerCase() === schema)
    ); // try to find the entity even if we don't have the schema name. AI should include it in schema.view syntax but if it doesn't we'll try to find
    if (e && e.length === 1) {
        return e[0].Name;
    } 
    else if (!e || e.length === 0) {
        console.warn(`Could not find entity for the specified DrillDownView: ${schemaAndView}`);
        return null;
    } 
    else if (e && e.length > 1) {
        console.warn(`Found more than one entity for the specified DrillDownView: ${schemaAndView}`);
        return null;
    }
    return null;
}