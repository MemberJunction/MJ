import { CompositeKey, LogError, LogStatus, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJEntityDocumentEntity, MJTemplateContentEntity } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { EntityDocumentTemplateParserBase } from './EntityDocumentTemplateParserBase';
import { EntityDocumentCache } from '../models/EntityDocumentCache';

/**
 * First-level subclass of EntityDocumentTemplateParserBase used to parse entity document templates
 * with variables, dotted context paths (__Parent), and functions such as Relationship().
 */
export class EntityDocumentTemplateParser extends EntityDocumentTemplateParserBase {
  /** Convenience factory method to get an instance via ClassFactory, allowing registered subclass overrides */
  public static CreateInstance(): EntityDocumentTemplateParser {
    return MJGlobal.Instance.ClassFactory.CreateInstance<EntityDocumentTemplateParser>(EntityDocumentTemplateParser);
  }

  /**
   * Resolves related records for an entity and recursively renders a child Entity Document over each.
   *
   * @param entityID - ID of the parent entity
   * @param entityRecord - Data of the parent entity record
   * @param ContextUser - Current user info
   * @param relationshipName - Name of the related entity / relationship
   * @param maxRows - Maximum number of related rows to load
   * @param entityDocumentName - Name of the child Entity Document to render over each related row
   * @returns Concatenated rendered output for all related rows, or raw JSON data if no document specified
   */
  protected async Relationship(
    entityID: string,
    entityRecord: Record<string, unknown>,
    ContextUser: UserInfo,
    relationshipName: string,
    maxRows: number,
    entityDocumentName: string
  ): Promise<string> {
    // G6 Note: Relationship() loads related entities per parent row. Batch-optimizing
    // related-record loading across multi-row batches is mapped in plans/feature-pipelines-build-plan.md (§3 D12, G6).
    const md = this.ProviderToUse;

    const entityInfo = md.Entities.find((e) => UUIDsEqual(e.ID, entityID));
    if (!entityInfo) {
      throw new Error(`Entity with ID ${entityID} not found.`);
    }

    const re = entityInfo.RelatedEntities.find((r) => r.RelatedEntity === relationshipName);
    if (!re) {
      throw new Error(`Relationship ${relationshipName} not found for entity ${entityInfo.Name}`);
    }

    const obj = await md.GetEntityObject(entityInfo.Name, ContextUser);
    const compositeKey = new CompositeKey();
    compositeKey.LoadFromEntityInfoAndRecord(entityInfo, entityRecord);
    const loadResult = await obj.InnerLoad(compositeKey);
    if (!loadResult) {
      LogError(`Failed to load entity ${entityInfo.Name} with ID ${compositeKey.ToString()}`);
      return '';
    }

    const reData = await obj.GetRelatedEntityDataExt(re, null, maxRows);

    if (reData && reData.Data && reData.Data.length > 0) {
      if (entityDocumentName && entityDocumentName.trim().length > 0) {
        // Resolve child entity document from cache
        const cache = EntityDocumentCache.Instance;
        if (!cache.IsLoaded) {
          await cache.Refresh(false, ContextUser);
        }
        const doc = cache.GetDocumentByName(entityDocumentName);
        if (doc) {
          // Resolve actual template text (C1 fix: never pass the template's name, pass the template's content text)
          const templateText = await this.resolveDocumentTemplateText(doc, ContextUser);
          const parser = EntityDocumentTemplateParser.CreateInstance();
          parser.ProviderOverride = this.ProviderToUse;

          const batchSize = 10;
          const results: string[] = [];

          for (let i = 0; i < reData.Data.length; i += batchSize) {
            const batchPromises = reData.Data.slice(i, i + batchSize).map((data: Record<string, unknown>) => {
              // D14: Child context gains __Parent pointing to the parent data context, chainable to arbitrary depth
              const childRecord: Record<string, unknown> = {
                ...data,
                __Parent: entityRecord,
              };
              return parser.Parse(templateText, re.RelatedEntityID, childRecord, ContextUser);
            });
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
          }

          return results.map((r) => r + '\n\n').join('');
        } else {
          LogStatus(`Entity Document with name ${entityDocumentName} not found.`);
          return '';
        }
      } else {
        return JSON.stringify({ Relationship: relationshipName, Data: reData.Data });
      }
    } else {
      return '{ No Data for: ' + relationshipName + ' }';
    }
  }

  /**
   * Resolves the template text from an Entity Document.
   * Priority:
   * 1. doc.TemplateText virtual property (MJEntityDocumentEntityExtended)
   * 2. doc.TemplateID_Object embedded record content
   * 3. TemplateEngine cached contents for doc.TemplateID
   * 4. RunView on MJ: Template Contents
   */
  public async resolveDocumentTemplateText(doc: MJEntityDocumentEntity, contextUser: UserInfo): Promise<string> {
    // 1. Virtual property on extended entity subclass if populated
    const extendedDoc = doc as unknown as { TemplateText?: string };
    if (extendedDoc.TemplateText && extendedDoc.TemplateText.trim().length > 0) {
      return extendedDoc.TemplateText;
    }

    // 2. Embedded record TemplateID_Object if loaded
    const embeddedTemplate = (doc as unknown as { TemplateID_Object?: { Content?: MJTemplateContentEntity[]; GetHighestPriorityContent?: () => MJTemplateContentEntity } }).TemplateID_Object;
    if (embeddedTemplate) {
      if (typeof embeddedTemplate.GetHighestPriorityContent === 'function') {
        const topContent = embeddedTemplate.GetHighestPriorityContent();
        if (topContent?.TemplateText) {
          return topContent.TemplateText;
        }
      }
      if (Array.isArray(embeddedTemplate.Content) && embeddedTemplate.Content.length > 0) {
        const top = embeddedTemplate.Content[0];
        if (top?.TemplateText) {
          return top.TemplateText;
        }
      }
    }

    // 3. TemplateEngine cached template contents
    if (doc.TemplateID) {
      const cached = TemplateEngineServer.Instance.TemplateContents.filter((tc) =>
        UUIDsEqual(tc.TemplateID, doc.TemplateID)
      );
      if (cached.length > 0) {
        const sorted = cached.sort((a, b) => {
          const aP = a.Priority ?? 0;
          const bP = b.Priority ?? 0;
          return aP - bP;
        });
        if (sorted[0]?.TemplateText) {
          return sorted[0].TemplateText;
        }
      }

      // Warm template cache if needed
      await TemplateEngineServer.Instance.Config(false, contextUser);
      const afterWarm = TemplateEngineServer.Instance.TemplateContents.filter((tc) =>
        UUIDsEqual(tc.TemplateID, doc.TemplateID)
      );
      if (afterWarm.length > 0) {
        if (afterWarm[0]?.TemplateText) {
          return afterWarm[0].TemplateText;
        }
      }

      // 4. Fallback: RunView lookup for template content
      const rv = new RunView();
      const rvResult = await rv.RunView<MJTemplateContentEntity>(
        {
          EntityName: 'MJ: Template Contents',
          ExtraFilter: `TemplateID = '${doc.TemplateID}'`,
          OrderBy: 'Priority ASC',
          MaxRows: 1,
          ResultType: 'entity_object',
        },
        contextUser
      );

      if (rvResult.Success && rvResult.Results.length > 0 && rvResult.Results[0].TemplateText) {
        return rvResult.Results[0].TemplateText;
      }
    }

    // Fallback: if doc has a Template property that is string, return it as last resort
    const fallbackTemplate = (doc as unknown as { Template?: string }).Template;
    return fallbackTemplate ?? '';
  }
}
