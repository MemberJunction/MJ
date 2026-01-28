import { Arg, Ctx, Field, InputType, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { RunViewByIDInput } from '../generic/RunViewResolver.js';
import { Message } from '@memberjunction/communication-types';
import { EntityCommunicationsEngine } from '@memberjunction/entity-communications-server';
import { RunViewParams } from '@memberjunction/core';
import { GraphQLJSONObject } from 'graphql-type-json';
import { TemplateEngineServer } from '@memberjunction/templates';
import { EntityCommunicationParams } from '@memberjunction/entity-communications-base';
import { z } from 'zod';
import { ResolverBase } from '../generic/ResolverBase.js';

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
  _mj_CreatedAt: Date;

  @Field()
  _mj_UpdatedAt: Date;

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
  _mj_CreatedAt: Date;

  @Field()
  _mj_UpdatedAt: Date;

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
  @Query(() => RunEntityCommunicationResultType)
  async RunEntityCommunicationByViewID(
    @Arg('entityID', () => String) entityID: string,
    @Arg('runViewByIDInput', () => RunViewByIDInput) runViewByIDInput: RunViewByIDInput,
    @Arg('providerName', () => String) providerName: string,
    @Arg('providerMessageTypeName', () => String) providerMessageTypeName: string,
    @Arg('message', () => CommunicationMessageInput) message: CommunicationMessageInput,
    @Arg('previewOnly', () => Boolean) previewOnly: boolean,
    @Arg('includeProcessedMessages', () => Boolean) includeProcessedMessages: boolean,
    @Ctx() { userPayload }: AppContext
  ): Promise<RunEntityCommunicationResultType> {
    // Check API key scope authorization for communication send
    await this.CheckAPIKeyScopeAuthorization('communication:send', entityID, userPayload);

    try {
      await EntityCommunicationsEngine.Instance.Config(false, userPayload.userRecord);
      const newMessage = new Message(message as unknown as Message);
      await TemplateEngineServer.Instance.Config(false, userPayload.userRecord);
      // for the templates, replace the values from the input with the objects from the Template Engine we have here
      if (newMessage.BodyTemplate) {
        newMessage.BodyTemplate = TemplateEngineServer.Instance.FindTemplate(newMessage.BodyTemplate.Name);
      }
      if (newMessage.HTMLBodyTemplate) {
        newMessage.HTMLBodyTemplate = TemplateEngineServer.Instance.FindTemplate(newMessage.HTMLBodyTemplate.Name);
      }
      if (newMessage.SubjectTemplate) {
        newMessage.SubjectTemplate = TemplateEngineServer.Instance.FindTemplate(newMessage.SubjectTemplate.Name);
      }
      const params: EntityCommunicationParams = {
        EntityID: entityID,
        RunViewParams: <RunViewParams>runViewByIDInput,
        ProviderName: providerName,
        ProviderMessageTypeName: providerMessageTypeName,
        Message: newMessage,
        PreviewOnly: previewOnly,
        IncludeProcessedMessages: includeProcessedMessages,
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
}
