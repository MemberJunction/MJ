import { Arg, Ctx, Field, InputType, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { RunViewByIDInput } from '../generic/RunViewResolver.js';
import { Message } from '@memberjunction/communication-types';
import { EntityCommunicationsEngine } from '@memberjunction/entity-communications-server';
import { DatabaseProviderBase, IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { GraphQLJSONObject } from 'graphql-type-json';
import { TemplateEngineServer } from '@memberjunction/templates';
import { EntityCommunicationParams } from '@memberjunction/entity-communications-base';
import { z } from 'zod';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadOnlyProvider } from '../util.js';

@InputType()
export class CommunicationProviderMessageType {
  @Field()
  ID: number;

  @Field()
  CommunicationProviderID: number;

  @Field()
  CommunicationBaseMessageTypeID: number;

  @Field()
  Name: string;

  @Field()
  Status: string;

  @Field()
  AdditionalAttributes: string;

  @Field()
  _mj_CreatedAt: Date;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field()
  _mj_UpdatedAt: Date;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field()
  CommunicationProvider?: string;

  @Field()
  CommunicationBaseMessageType?: string;
}

@InputType()
export class TemplateInputType {
  @Field()
  ID: number;

  @Field()
  Name: string;

  @Field()
  Description: string;

  @Field({ nullable: true })
  UserPrompt?: string;

  @Field({ nullable: true })
  CategoryID?: number;

  @Field()
  UserID: number;

  @Field({ nullable: true })
  ActiveAt?: Date;

  @Field({ nullable: true })
  DisabledAt?: Date;

  @Field()
  IsActive: boolean;

  @Field()
  _mj_CreatedAt: Date;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field()
  _mj_UpdatedAt: Date;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field({ nullable: true })
  Category?: string;

  @Field({ nullable: true })
  User?: string;
}
@InputType()
export class CommunicationMessageInput {
  /**
   * The type of message to send
   */
  @Field(() => CommunicationProviderMessageType)
  public MessageType: CommunicationProviderMessageType;

  /**
   * The sender of the message, typically an email address but can be anything that is provider-specific for example for a provider that is a social
   * media provider, it might be a user's social media handle
   */
  @Field()
  public From: string;

  /**
   * The recipient of the message, typically an email address but can be anything that is provider-specific for example for a provider that is a social
   * media provider, it might be a user's social media handle
   */
  @Field()
  public To: string;

  /**
   * The body of the message, used if BodyTemplate is not provided.
   */
  @Field({ nullable: true })
  public Body?: string;
  /**
   * Optional, when provided, Body is ignored and the template is used to render the message. In addition,
   * if BodyTemplate is provided it will be used to render the Body and if the template has HTML content it will
   * also be used to render the HTMLBody
   */
  @Field(() => TemplateInputType, { nullable: true })
  public BodyTemplate?: TemplateInputType;

  /**
   * The HTML body of the message
   */
  @Field({ nullable: true })
  public HTMLBody?: string;
  /**
   * Optional, when provided, HTMLBody is ignored and the template is used to render the message. This OVERRIDES
   * the BodyTemplate's HTML content even if BodyTemplate is provided. This allows for flexibility in that you can
   * specify a completely different HTMLBodyTemplate and not just relay on the TemplateContent of the BodyTemplate having
   * an HTML option.
   */
  @Field(() => TemplateInputType, { nullable: true })
  public HTMLBodyTemplate?: TemplateInputType;

  /**
   * The subject line for the message, used if SubjectTemplate is not provided and only supported by some providers
   */
  @Field({ nullable: true })
  public Subject?: string;
  /**
   * Optional, when provided, Subject is ignored and the template is used to render the message
   */
  @Field(() => TemplateInputType, { nullable: true })
  public SubjectTemplate?: TemplateInputType;

  /**
   * Optional, any context data that is needed to render the message template
   */
  @Field(() => GraphQLJSONObject, { nullable: true })
  public ContextData?: any;
}

@ObjectType()
export class RunEntityCommunicationResultType {
  @Field()
  Success: boolean;

  @Field({ nullable: true })
  ErrorMessage?: string;

  /**
   * Optional, any context data that is needed to render the message template
   */
  @Field(() => GraphQLJSONObject, { nullable: true })
  public Results?: any;
}

@Resolver(RunEntityCommunicationResultType)
export class ReportResolver extends ResolverBase {
  /**
   * Runs a message against a view of records, as the caller. The recipient and related-entity reads
   * run as the authenticated user, so a preview returns and a send merges only rows and fields that
   * user may read. The view's client-supplied clauses get the same screen as a RunView request.
   */
  @Query(() => RunEntityCommunicationResultType)
  async RunEntityCommunicationByViewID(
    @Arg('entityID', () => String) entityID: string,
    @Arg('runViewByIDInput', () => RunViewByIDInput) runViewByIDInput: RunViewByIDInput,
    @Arg('providerName', () => String) providerName: string,
    @Arg('providerMessageTypeName', () => String) providerMessageTypeName: string,
    @Arg('message', () => CommunicationMessageInput) message: CommunicationMessageInput,
    @Arg('previewOnly', () => Boolean) previewOnly: boolean,
    @Arg('includeProcessedMessages', () => Boolean) includeProcessedMessages: boolean,
    @Ctx() { userPayload, providers }: AppContext
  ): Promise<RunEntityCommunicationResultType> {
    // Check API key scope authorization for communication send
    await this.CheckAPIKeyScopeAuthorization('communication:send', entityID, userPayload);

    try {
      const contextUser = this.GetUserFromPayload(userPayload);
      if (!contextUser) throw new Error('Unable to determine the acting user for this communication');
      const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
      this.screenClientViewClauses(
        {
          extraFilter: runViewByIDInput.ExtraFilter,
          orderBy: runViewByIDInput.OrderBy,
          userSearchString: runViewByIDInput.UserSearchString,
          overrideExcludeFilter: runViewByIDInput.OverrideExcludeFilter,
        },
        provider as unknown as IMetadataProvider,
        contextUser,
      );
      await this.assertViewBelongsToEntity(runViewByIDInput.ViewID, entityID, provider, contextUser);

      await EntityCommunicationsEngine.Instance.Config(false, contextUser);
      const newMessage = await this.resolveMessageTemplates(message, contextUser);
      const params: EntityCommunicationParams = {
        EntityID: entityID,
        RunViewParams: <RunViewParams>runViewByIDInput,
        ProviderName: providerName,
        ProviderMessageTypeName: providerMessageTypeName,
        Message: newMessage,
        PreviewOnly: previewOnly,
        IncludeProcessedMessages: includeProcessedMessages,
        ContextUser: contextUser,
      };
      const result = await EntityCommunicationsEngine.Instance.RunEntityCommunication(params);
      return {
        Success: result.Success,
        ErrorMessage: result.ErrorMessage,
        Results: includeProcessedMessages && result.Results ? { Results: result.Results } : undefined,
      };
    } catch (e) {
      const { message } = z
        .object({ message: z.string() })
        .catch({ message: JSON.stringify(e) })
        .parse(e);
      return {
        Success: false,
        ErrorMessage: message,
      };
    }
  }

  /**
   * Refuses a view that is not a view of `entityID`, with the same message as for a view that does
   * not exist or that the caller cannot load, so the refusal does not reveal which views exist.
   */
  private async assertViewBelongsToEntity(viewID: string | undefined, entityID: string, provider: DatabaseProviderBase, contextUser: UserInfo): Promise<void> {
    if (!viewID) return;
    const view = await this.resolveUserViewByID(viewID, provider, contextUser);
    if (!view?.ID || !UUIDsEqual(view.ID, viewID) || !UUIDsEqual(view.EntityID, entityID)) {
      throw new Error('The requested view does not exist or you do not have access to it');
    }
  }

  /** Builds the message, replacing each template the client named with the server's copy of it. */
  private async resolveMessageTemplates(message: CommunicationMessageInput, contextUser: UserInfo): Promise<Message> {
    const newMessage = new Message(message as unknown as Message);
    await TemplateEngineServer.Instance.Config(false, contextUser);
    if (newMessage.BodyTemplate) {
      newMessage.BodyTemplate = TemplateEngineServer.Instance.FindTemplate(newMessage.BodyTemplate.Name);
    }
    if (newMessage.HTMLBodyTemplate) {
      newMessage.HTMLBodyTemplate = TemplateEngineServer.Instance.FindTemplate(newMessage.HTMLBodyTemplate.Name);
    }
    if (newMessage.SubjectTemplate) {
      newMessage.SubjectTemplate = TemplateEngineServer.Instance.FindTemplate(newMessage.SubjectTemplate.Name);
    }
    return newMessage;
  }
}
