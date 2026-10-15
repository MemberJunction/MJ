import { LogError } from '@memberjunction/core';
import type { EntityInfo, RunView, UserInfo } from '@memberjunction/core';
import type { MJTemplateEntityExtended } from '@memberjunction/core-entities';
import type { TemplateParamData } from '../generic/vectorSync.types';

/**
 * Builds the data an entity document's template renders for each record.
 *
 * Vector sync renders this data to produce the text it embeds and stores; duplicate detection
 * renders it to produce the text it embeds and queries with. Both build it here so the two texts
 * match: a template param of type `Entity` (a related entity, such as a person's Phones or Emails)
 * is loaded for detection exactly as it is for sync. When detection rendered from the record's own
 * fields alone, those params rendered empty, its query vector described a shorter document than the
 * one stored, and duplicates that shared contact data fell below the match threshold.
 */
export class EntityDocumentTemplateDataBuilder {
  /**
   * @param runView the RunView to load related rows with, bound to the caller's provider
   * @param contextUser the user the related rows are loaded as
   */
  constructor(private readonly runView: RunView, private readonly contextUser?: UserInfo) {}

  /**
   * Load the rows every `Entity` param of the template needs, for a batch of records: one RunView
   * per param, filtered to the batch's keys and the param's own ExtraFilter.
   *
   * A record with no primary-key value (an unsaved record) has no related rows. When no record in
   * the batch has one, the param gets an empty list without a query.
   *
   * A param whose rows fail to load is logged and left out of the result; see {@link MissingRelatedParams}.
   */
  public async LoadRelatedData(entity: EntityInfo, records: Record<string, unknown>[], template: MJTemplateEntityExtended): Promise<TemplateParamData[]> {
    const relatedData: TemplateParamData[] = [];
    const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : ''; // first-pk-ok: LinkedParameterField is a single-column FK on the related entity pointing at this entity's key
    const pkName = entity.FirstPrimaryKey.Name; // first-pk-ok: LinkedParameterField is a single-column FK on the related entity pointing at this entity's key
    const keyValues = records
      .map((record) => record[pkName])
      .filter((value) => value != null && value !== '')
      .map((value) => `${quotes}${String(value).replace(/'/g, "''")}${quotes}`);

    for (const templateParam of template.Params) {
      if (templateParam.Type !== 'Entity') {
        continue;
      }
      if (keyValues.length === 0) {
        relatedData.push({ ParamName: templateParam.Name, Data: [] });
        continue;
      }

      const filter = `${templateParam.LinkedParameterField} in (${keyValues.join(',')})`;
      const finalFilter = templateParam.ExtraFilter ? `(${filter}) AND (${templateParam.ExtraFilter})` : filter;
      const result = await this.runView.RunView<Record<string, unknown>>({
        EntityName: templateParam.Entity,
        ExtraFilter: finalFilter,
        ResultType: 'simple'
      }, this.contextUser);

      if (result && result.Success) {
        relatedData.push({ ParamName: templateParam.Name, Data: result.Results });
      } else {
        LogError(`Error getting related data for entity ${templateParam.Entity} with filter ${finalFilter}`, undefined, result?.ErrorMessage);
      }
    }

    return relatedData;
  }

  /**
   * The data one record's template renders: the record's own fields at the top level for a
   * `Record` param, the record's own related rows for an `Entity` param, and the field's value for
   * a `Scalar` param.
   *
   * @param record the record's row, as RunView returns it with `ResultType: 'simple'`
   * @param relatedData the batch's related rows, from {@link LoadRelatedData}
   */
  public BuildTemplateData(entity: EntityInfo, record: Record<string, unknown>, template: MJTemplateEntityExtended, relatedData: TemplateParamData[]): Record<string, unknown> {
    const templateData: Record<string, unknown> = {};
    for (const param of template.Params) {
      switch (param.Type) {
        case 'Record':
          // NEW convention: main entity fields are TOP-LEVEL variables (no Entity. prefix).
          // Spread record fields directly into the root context so templates use {{FieldName}}.
          Object.assign(templateData, record);
          break;
        case 'Entity': {
          if (templateData[param.Name]) {
            continue;
          }
          const paramData: TemplateParamData | undefined = relatedData.find((rd: TemplateParamData) => rd.ParamName === param.Name);
          if (!paramData) {
            LogError(`No related data found for param ${param.Name} in template ${template.ID}`);
            break;
          }
          // Related entities use their relationship name as prefix: {{RelationshipName.FieldName}}
          const pkValue = record[entity.FirstPrimaryKey.Name]; // first-pk-ok: LinkedParameterField is a single-column FK on the related entity pointing at this entity's key
          templateData[param.Name] = paramData.Data.filter((rdfr: unknown) => {
            const typedRdfr = rdfr as Record<string, unknown>;
            return typedRdfr[param.LinkedParameterField] === pkValue;
          });
          break;
        }
        case 'Scalar':
          // Flat convention: entity fields are top-level, so pull directly from record
          templateData[param.Name] = record[param.Name] ?? '';
          break;
        case 'Array':
        case 'Object':
          LogError(`Unsupported parameter type ${param.Type} for parameter ${param.Name} in template ${template.ID}`);
          break;
      }
    }
    return templateData;
  }

  /** The names of the template's `Entity` params that have no entry in the related data. */
  public MissingRelatedParams(template: MJTemplateEntityExtended, relatedData: TemplateParamData[]): string[] {
    return template.Params
      .filter((param) => param.Type === 'Entity' && !relatedData.some((rd) => rd.ParamName === param.Name))
      .map((param) => param.Name);
  }
}
