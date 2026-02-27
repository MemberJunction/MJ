import { CommunicationEngine } from "@memberjunction/communication-engine";
import { MJCommunicationProviderEntityExtended, Message, MessageRecipient } from "@memberjunction/communication-types";
import { EntityInfo, LogStatus, Metadata, RunView, RunViewParams, RunViewResult, UserInfo } from "@memberjunction/core";
import { MJListDetailEntityType, MJListEntityType, MJTemplateEntityExtended, MJTemplateParamEntity } from "@memberjunction/core-entities";
import { MJEntityCommunicationMessageTypeEntityExtended, EntityCommunicationParams, EntityCommunicationResult, EntityCommunicationsEngineBase } from "@memberjunction/entity-communications-base";

 
/**
 * Server-side implementation of the entity communications engine
 */
export class EntityCommunicationsEngine extends EntityCommunicationsEngineBase {

    public static get Instance(): EntityCommunicationsEngine {
        return super.getInstance<EntityCommunicationsEngine>();
    }

    /**
     * Executes a given message request against a view of records for a given entity
     */
    public async RunEntityCommunication(params: EntityCommunicationParams): Promise<EntityCommunicationResult> {
        try {
            this.TryThrowIfNotLoaded();

            const md = new Metadata();
            const entityInfo = md.Entities.find(e => e.ID === params.EntityID);    
            if (!entityInfo)
                throw new Error(`Entity ${params.EntityID} not found`);
    
            if (!this.EntitySupportsCommunication(params.EntityID)) {
                throw new Error(`Entity ${params.EntityID} does not support communication`);
            }
    
            await CommunicationEngine.Instance.Config(false, this.ContextUser);
    
            const provider: MJCommunicationProviderEntityExtended = CommunicationEngine.Instance.Providers.find(p => p.Name.trim().toLowerCase() === params.ProviderName.trim().toLowerCase());
            if (!provider) {
                throw new Error(`Provider ${params.ProviderName} not found`);
            }

            if(!provider.SupportsSending){
                throw new Error(`Provider ${params.ProviderName} does not support sending messages`);
            }

            const message: Message = params.Message;
            if(message.SendAt && !provider.SupportsScheduledSending){
                throw new Error(`Provider ${params.ProviderName} does not support scheduled sending`);
            }

            const providerMessageType = provider.MessageTypes.find(mt => mt.Name.trim().toLowerCase() === params.ProviderMessageTypeName.trim().toLowerCase());
    
            const entityMessageTypes = this.GetEntityCommunicationMessageTypes(params.EntityID);
            const entityMessageType = entityMessageTypes.find(m => m.BaseMessageTypeID === providerMessageType.CommunicationBaseMessageTypeID);
            if (!entityMessageType) {
                throw new Error(`Entity ${params.EntityID} does not support message type ${providerMessageType.CommunicationBaseMessageType}`);
            }
    
            // next our main job here is to run the view, get all the records, and then call the communication engine
            const rv = new RunView();
            const rvParams2 = {
                ...params.RunViewParams
            }
            // now change rvParams2.Fields to have ALL entity fields to make sure we get them all
            rvParams2.Fields = entityInfo.Fields.map(f => f.Name);
    
            const result = await rv.RunView(rvParams2, this.ContextUser);
            if (result && result.Success) {
                // have the results, now we can map the results to the types the comm engine needs and call SendMessages() in the comm engine
                await CommunicationEngine.Instance.Config(false, this.ContextUser);

                const recipients = await this.PopulateRecipientContextData(entityInfo, entityMessageType, params.Message, result.Results);
                const sendResult = await CommunicationEngine.Instance.SendMessages(params.ProviderName, params.ProviderMessageTypeName, params.Message, recipients, params.PreviewOnly);
                if (sendResult && sendResult.length === recipients.length) {
                    // make sure none of the messages failed
                    return { 
                        Success: !sendResult.some(r => !r.Success), 
                        ErrorMessage: sendResult.filter(r => !r.Success).map(r => r.Error).join('; '),
                        Results: sendResult.map((r,i) => {
                            return {
                                RecipientData: recipients[i], 
                                Message: r.Message
                            }
                        })
                    };
                }
            }
            else {
                throw new Error(`Failed to run view ${params.RunViewParams.ViewName}: ${result.ErrorMessage}`);
            }
    
            return {
                Success: false,
                ErrorMessage: 'Unknown error'
            }
        }
        catch (e) {
            return {
                Success: false,
                ErrorMessage: e.message
            }
        }
    }

    protected async PopulateRecipientContextData(entityInfo: EntityInfo, entityMessageType: MJEntityCommunicationMessageTypeEntityExtended, message: Message, records: any[]): Promise<MessageRecipient[]> {
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
        const relatedData = await this.GetRelatedData(message, records, entityInfo.FirstPrimaryKey.Name, entityInfo.FirstPrimaryKey.NeedsQuotes);
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
            const pkey = r[entityInfo.FirstPrimaryKey.Name];
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
     * @param message 
     * @param records 
     */
    protected async GetRelatedData(message: Message, recipients: any[], recipientPrimaryKeyFieldName: string, recipientPrimaryKeyNeedsQuotes: boolean): Promise<{paramName: string, data: any[]}[]> {
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
            const rv = new RunView();
            const params: any = {
                EntityName: relatedEntity,
                ExtraFilter: finalFilter,
            }
            const result = await rv.RunView(params, this.ContextUser);
            if (result && result.Success) {
                data.push({
                    paramName: p.Name,
                    data: result.Results
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
