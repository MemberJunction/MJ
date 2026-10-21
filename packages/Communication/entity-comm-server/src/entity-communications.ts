import { CommunicationEngine } from "@memberjunction/communication-engine";
import { MJCommunicationProviderEntityExtended, Message, MessageRecipient } from "@memberjunction/communication-types";
import { EntityInfo, LogStatus, Metadata, RunView, RunViewParams, RunViewResult, UserInfo } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import { MJListDetailEntityType, MJListEntityType, MJTemplateEntityExtended, MJTemplateParamEntity } from "@memberjunction/core-entities";
import { MJEntityCommunicationMessageTypeEntityExtended, EntityCommunicationParams, EntityCommunicationResult, EntityCommunicationsEngineBase } from "@memberjunction/entity-communications-base";

 
/** One row of a recipient or related-entity view, as RunView returns it with `ResultType: 'simple'`. */
export type EntityCommunicationRecord = Record<string, unknown>;

/**
 * Server-side implementation of the entity communications engine
 */
export class EntityCommunicationsEngine extends EntityCommunicationsEngineBase {

    public static get Instance(): EntityCommunicationsEngine {
        return super.getInstance<EntityCommunicationsEngine>();
    }

    /**
     * Executes a given message request against a view of records for a given entity.
     *
     * Every read runs as `params.ContextUser`, the acting user, so row-level security, entity
     * permissions and field-level security apply. A request without one is refused rather than run
     * under the engine's own context user, which would let a preview read past all three.
     */
    public async RunEntityCommunication(params: EntityCommunicationParams): Promise<EntityCommunicationResult> {
        try {
            this.TryThrowIfNotLoaded();
            const contextUser = params.ContextUser;
            if (!contextUser)
                throw new Error('EntityCommunicationParams.ContextUser is required: entity communications run as the acting user');

            const md = new Metadata(); // global-provider-ok: server bootstrap, single-provider context
            const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, params.EntityID));
            if (!entityInfo)
                throw new Error(`Entity ${params.EntityID} not found`);
            if (!this.EntitySupportsCommunication(params.EntityID))
                throw new Error(`Entity ${params.EntityID} does not support communication`);

            await CommunicationEngine.Instance.Config(false, contextUser);
            const entityMessageType = this.ResolveEntityMessageType(params);
            const records = await this.RunRecipientView(entityInfo, params.RunViewParams, contextUser);
            const recipients = await this.PopulateRecipientContextData(entityInfo, entityMessageType, params.Message, records, contextUser);
            const sendResult = await CommunicationEngine.Instance.SendMessages(params.ProviderName, params.ProviderMessageTypeName, params.Message, recipients, params.PreviewOnly, undefined, contextUser);
            if (sendResult && sendResult.length === recipients.length) {
                return {
                    Success: !sendResult.some(r => !r.Success),
                    ErrorMessage: sendResult.filter(r => !r.Success).map(r => r.Error).join('; '),
                    Results: sendResult.map((r, i) => ({ RecipientData: recipients[i], Message: r.Message }))
                };
            }
            return {
                Success: false,
                ErrorMessage: `Communication engine returned ${sendResult?.length ?? 0} results for ${recipients.length} recipients`
            }
        }
        catch (e) {
            return {
                Success: false,
                ErrorMessage: e instanceof Error ? e.message : String(e)
            }
        }
    }

    /**
     * Finds the provider and the entity's message type the request names, validating that the
     * provider can send (and schedule, when the message asks for it).
     */
    protected ResolveEntityMessageType(params: EntityCommunicationParams): MJEntityCommunicationMessageTypeEntityExtended {
        const provider: MJCommunicationProviderEntityExtended = CommunicationEngine.Instance.Providers.find(p => p.Name.trim().toLowerCase() === params.ProviderName.trim().toLowerCase());
        if (!provider)
            throw new Error(`Provider ${params.ProviderName} not found`);
        if (!provider.SupportsSending)
            throw new Error(`Provider ${params.ProviderName} does not support sending messages`);
        if (params.Message.SendAt && !provider.SupportsScheduledSending)
            throw new Error(`Provider ${params.ProviderName} does not support scheduled sending`);

        const providerMessageType = provider.MessageTypes.find(mt => mt.Name.trim().toLowerCase() === params.ProviderMessageTypeName.trim().toLowerCase());
        if (!providerMessageType)
            throw new Error(`Provider ${params.ProviderName} does not have message type ${params.ProviderMessageTypeName}`);
        const entityMessageType = this.GetEntityCommunicationMessageTypes(params.EntityID).find(m => UUIDsEqual(m.BaseMessageTypeID, providerMessageType.CommunicationBaseMessageTypeID));
        if (!entityMessageType)
            throw new Error(`Entity ${params.EntityID} does not support message type ${providerMessageType.CommunicationBaseMessageType}`);
        return entityMessageType;
    }

    /**
     * Runs the caller's view of recipient records as `contextUser`, asking for every field of the
     * entity. The provider narrows that list to the fields the user may read; the rows are stripped
     * again here so a denied field can never reach a message.
     */
    protected async RunRecipientView(entityInfo: EntityInfo, runViewParams: RunViewParams, contextUser: UserInfo): Promise<EntityCommunicationRecord[]> {
        const rvParams: RunViewParams = {
            ...runViewParams,
            EntityName: entityInfo.Name,
            Fields: entityInfo.Fields.map(f => f.Name),
            ResultType: 'simple'
        };
        const result = await new RunView().RunView<EntityCommunicationRecord>(rvParams, contextUser);
        if (!result || !result.Success)
            throw new Error(`Failed to run view ${runViewParams.ViewName ?? runViewParams.ViewID ?? entityInfo.Name}: ${result?.ErrorMessage}`);
        return this.StripDeniedReadFields(entityInfo, result.Results, contextUser);
    }

    /**
     * Returns copies of `rows` without any field `contextUser` may not read on `entityInfo`, so a
     * template that references a denied field renders it empty.
     */
    protected StripDeniedReadFields(entityInfo: EntityInfo, rows: EntityCommunicationRecord[], contextUser: UserInfo): EntityCommunicationRecord[] {
        if (!entityInfo.EnableFieldLevelSecurity)
            return rows;
        const denied = entityInfo.GetDeniedReadFields(contextUser);
        if (denied.size === 0)
            return rows;
        return rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !denied.has(key.trim().toLowerCase()))));
    }

    /**
     * Builds one recipient per record, with the template context data each needs. `contextUser` is
     * the acting user; related-entity data is read as that user.
     */
    protected async PopulateRecipientContextData(entityInfo: EntityInfo, entityMessageType: MJEntityCommunicationMessageTypeEntityExtended, message: Message, records: any[], contextUser?: UserInfo): Promise<MessageRecipient[]> {
        // we have now validated we are good on the message type requested...
        // next up we will figure out which field to use for the entity, starting at the entity level and then going to the record level, IF the entity has
        // a PreferredCommunicationField we will flag that here as recordLevelPref = true
        const recordLevelPref = entityInfo.PreferredCommunicationField?.length > 0;
        // get the highest priority field within the entityMessageType.communicationFields property
        const entityLevelPrefField = entityMessageType.CommunicationFields.sort((a, b) => a.Priority - b.Priority)[0];
        const hasTemplates = message.BodyTemplate || message.HTMLBodyTemplate || message.SubjectTemplate;
        if (hasTemplates) {
            this.ValidateTemplateContextParamAlignment(message);
        }
        const relatedData = await this.GetRelatedData(message, records, entityInfo.FirstPrimaryKey.Name, entityInfo.FirstPrimaryKey.NeedsQuotes, contextUser); // first-pk-ok: the recipient key is the FK target of each Entity-param's LinkedParameterField; FK targets are single-column by design
        // assume that the template(s) if there are multiple, ALL use the same parameters for their contexts, that is validated above
        const templates: MJTemplateEntityExtended[] = [];
        if (message.BodyTemplate) {
            templates.push(message.BodyTemplate);
        }
        if (message.HTMLBodyTemplate) {
            templates.push(message.HTMLBodyTemplate);
        }
        if (message.SubjectTemplate) {
            templates.push(message.SubjectTemplate);
        }
        const params = [];
        templates.forEach(t => {
            t.Params.forEach(p => {
                if (!params.includes(p)) {
                    params.push(p);
                }
            });
        });

        const recipients: MessageRecipient[] = [];  
        for (const r of records) {
            // in the below we get the VALUE of the record level preferred field if it exists, otherwise we get the value of the entity level preferred field
            const ToValue = !recordLevelPref ? r[entityLevelPrefField.FieldName] : r[r[entityInfo.PreferredCommunicationField]];
            // we have mapped the ToValue based on preferences, next up, we need to populate the context data, if there are any templates
            // if there are no templates, we skip this step to save time
            const pkey = r[entityInfo.FirstPrimaryKey.Name]; // first-pk-ok: compared against LinkedParameterField, an FK back to the recipient entity — single-column by design
            const retVal = {
                To: ToValue,
                ContextData: {}
            }
            if (hasTemplates) {
                retVal.ContextData = await this.PopulateSingleRecipientContextData(r, relatedData, pkey, params);                
            }
            recipients.push(retVal);
        }

        return recipients;
    }

    protected async PopulateSingleRecipientContextData(record: any, relatedData: {paramName: string, data: any[]}[], pkey: any, params: MJTemplateParamEntity[]): Promise<{[key: string]: any}> {
        // now, go through each template, and populate the context data for that param, but only do if we've not already processed that parameter since templates across Body/BodyHTML/Subject can share parameters
        const contextData = {};
        for (const p of params) {
            if (!contextData[p.Name]) {
                // we have not processed this parameter yet, so we will do so now.
                // Params have various types, so we will switch on that here
                switch (p.Type) {
                    case "Record":
                        // this one is simple, we create a property by the provided name, and set the value to the record we are currently processing
                        contextData[p.Name] = record;
                        break;
                    case "Entity":
                        // here we need to grab the related data from another entity and filter it down for the record we are current processing so it only shows the related data
                        // the metadata in the param tells us what we need to know
                        const d = relatedData.find(rd => rd.paramName === p.Name);
                        // now filter down the data in d to just this record
                        const relatedDataForRecord = d.data.filter(rdfr => rdfr[p.LinkedParameterField] === pkey);
                        // and set the value of the context data to the filtered data
                        contextData[p.Name] = relatedDataForRecord;
                        break;
                    case "Array":
                    case "Scalar":
                    case "Object":
                        // do nothing here, we don't directly support these param types from messaging. These param types are used
                        // when programs directly invoke the templating engine, but are not used by the Communication Engine
                        break;
                }
            }
        }
        return contextData;
    }

    /**
     * Returns an array of objects that have the distinct param names across all templates in use, and the complete data for
     * those relationships for all of the recipient records provided to the method.
     * Each related entity is read as `contextUser`, and its rows are stripped of fields that user may
     * not read.
     * @param message 
     * @param records 
     * @param contextUser the acting user; required, the read never falls back to the engine's own user
     */
    protected async GetRelatedData(message: Message, recipients: any[], recipientPrimaryKeyFieldName: string, recipientPrimaryKeyNeedsQuotes: boolean, contextUser?: UserInfo): Promise<{paramName: string, data: any[]}[]> {
        if (!contextUser)
            throw new Error('GetRelatedData requires the acting user');
        // First, get a distinct list of params of type Entity
        const templates: MJTemplateEntityExtended[] = [];
        if (message.BodyTemplate) {
            templates.push(message.BodyTemplate);
        }
        if (message.HTMLBodyTemplate) {
            templates.push(message.HTMLBodyTemplate);
        }
        if (message.SubjectTemplate) {
            templates.push(message.SubjectTemplate);
        }
        const entityParams: MJTemplateParamEntity[] = [];
        templates.forEach(t => {
            t.Params.forEach(p => {
                if (p.Type === "Entity" && !entityParams.includes(p)) {
                    entityParams.push(p);
                }
            });
        });

        const data: {paramName: string, data: any[]}[] = [];
        // now we have a distinct list of params that are of type Entity, we need to get the related data for each of these params
        for (const p of entityParams) {
            // we need to get the related data for this param, and filter it down to just the records we are currently processing
            // the metadata in the param tells us what we need to know
            const relatedEntity = p.Entity;
            const relatedField = p.LinkedParameterField;
            // construct a filter for the related field so that we constrain the results to just the set of records linked to our recipients
            const quotes = recipientPrimaryKeyNeedsQuotes ? "'" : "";
            const filter = `${relatedField} in (${recipients.map(r => `${quotes}${r[recipientPrimaryKeyFieldName]}${quotes}`).join(',')})`;
            const finalFilter = p.ExtraFilter ? `(${filter}) AND (${p.ExtraFilter})` : filter;
            const params: RunViewParams = {
                EntityName: relatedEntity,
                ExtraFilter: finalFilter,
                ResultType: 'simple'
            }
            const result = await new RunView().RunView<EntityCommunicationRecord>(params, contextUser);
            if (result && result.Success) {
                const relatedEntityInfo = new Metadata().EntityByName(relatedEntity); // global-provider-ok: server bootstrap, single-provider context
                data.push({
                    paramName: p.Name,
                    data: relatedEntityInfo ? this.StripDeniedReadFields(relatedEntityInfo, result.Results, contextUser) : result.Results
                });
            }
        }

        return data;
    }   

    /**
     * This method is resposnible for determining if the template(s) used in the message have aligned parameters, meaning they don't have overlapping parameter names that have 
     * different meanings. It is okay for scenarios where there are > 1 template in use for a message to have different parameter names, but if they have the SAME parameter names
     * they must not have different settings.
     */
    protected ValidateTemplateContextParamAlignment(message: Message): boolean {
        // go through each template, and compare it's parameters to look for OVERLAP on param names with the other templates. If there is overlap
        // make sure the definitions are the same, if they are not, throw an error.
        const templates = []; 
        if (message.BodyTemplate) {
            templates.push(message.BodyTemplate);
        }
        if (message.HTMLBodyTemplate) {
            templates.push(message.HTMLBodyTemplate);
        }
        if (message.SubjectTemplate) {
            templates.push(message.SubjectTemplate);
        }
        // the params are defined in each template they will be in the Params property of the template
        const paramNames = [];
        for (const t of templates) {
            for (const p of t.Params) {
                if (paramNames.includes(p.Name)) {
                    // we have a duplicate parameter name, now we need to check if the definitions are the same
                    const otherParam = paramNames.find(p2 => p2.Name === p.Name);
                    if (otherParam.Type !== p.Type) {
                        throw new Error(`Parameter ${p.Name} has different types in different templates`);
                    }
                }
                else {
                    paramNames.push(p);
                }
            }
        }
        // if we get here, we are good, otherwise we will have thrown an exception
        return true;
    }
}
