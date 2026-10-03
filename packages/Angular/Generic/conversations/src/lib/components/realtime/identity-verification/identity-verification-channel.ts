import type { Type } from '@angular/core';
import type { Subscription } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import type { JSONObject } from '@memberjunction/ai';
import {
  IsIdentityVerifiedEventPayload,
  REALTIME_CHANNEL_CONTRACT_VERSION,
  type RealtimeChannelActor,
  type RealtimeChannelDescriptor
} from '@memberjunction/ai-core-plus';
import { GraphQLDataProvider, GraphQLRealtimeSessionClient } from '@memberjunction/graphql-dataprovider';
import {
  BaseRealtimeChannelClient,
  type ChannelOnboardingDetails,
  type RealtimeChannelVerbResult
} from '@memberjunction/realtime-runtime';
import { IdentityVerificationModel, type IdentityVerificationChange, type IdentityVerificationService } from './identity-verification-model';
import { IdentityVerificationSurfaceComponent } from './identity-verification-surface.component';

/** The registry key (`MJ: AI Agent Channels` → `ClientPluginClass`) and the channel's name. */
export const IDENTITY_VERIFICATION_CHANNEL_NAME = 'IdentityVerification';

/** The verbs, by name — the vocabulary the agent, the surface and the tests share. */
export const IDENTITY_VERIFICATION_VERBS = {
  Fill: 'fill',
  Confirm: 'confirm',
  Submit: 'submit',
  Resend: 'resend',
  EnterCode: 'enter_code'
} as const;

const FIELD_PARAM = { type: 'string', enum: ['name', 'email'], description: 'Which detail: "name" or "email".' };

/**
 * IDENTITY VERIFICATION as a generic, opt-in interactive channel: the way an agent helps a person —
 * typically an anonymous visitor — prove they control an email address without leaving the call.
 *
 * What it models: three nouns (name, email, status), five verbs. The agent can `fill` what it heard, but
 * only the USER can `confirm` it (enforced twice: `InvokableBy: 'user'`, which the runtime checks before
 * dispatch, and again inside the verb). `submit` then asks the server to email a one-time code and link;
 * `enter_code` hands the typed code back; `resend` asks for a fresh one. The channel never decides whether
 * a person IS verified — the server's `identity.verified` session event does, and the channel follows it.
 *
 * The server half is a thin plugin that validates nothing beyond scope (see `IdentityVerificationChannelServer`);
 * the real checks — domain policy, rate limits, hashing, expiry — live in the verification service.
 *
 * Opt in per agent or app with `channels.config.IdentityVerification`; open it from the host with
 * `openChannel('IdentityVerification', { name, email })` or let the agent open it on demand.
 */
@RegisterClass(BaseRealtimeChannelClient, 'IdentityVerificationChannel')
export class IdentityVerificationChannel extends BaseRealtimeChannelClient<IdentityVerificationSurfaceComponent> {
  /** The state machine. Public so the surface and tests share the one instance. */
  public readonly Model: IdentityVerificationModel = new IdentityVerificationModel(this.createService(), () => this.now());

  private surface: IdentityVerificationSurfaceComponent | null = null;
  private eventsSub: Subscription | null = null;

  public get ChannelName(): string {
    return IDENTITY_VERIFICATION_CHANNEL_NAME;
  }

  public override get TabTitle(): string {
    return 'Verify your identity';
  }

  public override get TabIcon(): string {
    return 'fa-solid fa-user-shield';
  }

  /** Clock hook for tests. */
  protected now(): number {
    return Date.now();
  }

  public override GetDescriptor(): RealtimeChannelDescriptor {
    return {
      Key: this.ChannelName,
      Version: REALTIME_CHANNEL_CONTRACT_VERSION,
      DisplayName: 'Identity verification',
      OwningPackage: '@memberjunction/ng-conversations',
      Instructions:
        'Helps the user prove who they are by email, during this call. Ask for their name and email, `fill` what you hear, ' +
        'then ask the user to check the form and press Confirm — only they can confirm, so never claim you did. ' +
        'Once both are confirmed, `submit` emails them a code and a link. They can type the code in themselves, or you can ' +
        '`enter_code` if they read it to you; or they can open the link, which completes it on its own. ' +
        'Never repeat a code or an email back unprompted. Check `status`: it becomes "verified" when the server confirms it — ' +
        'do not treat the person as verified before that.',
      Nouns: [
        { Name: 'name', Description: "The person's name, as entered.", Schema: { type: 'string' } },
        { Name: 'email', Description: "The person's email address, as entered.", Schema: { type: 'string' } },
        {
          Name: 'status',
          Description: 'Where verification stands: collecting (getting details, or ready to send), sending, code_sent, verifying, verified.',
          Schema: { type: 'string', enum: ['collecting', 'sending', 'code_sent', 'verifying', 'verified'] }
        },
        {
          Name: 'confirmed',
          Description: 'Whether the USER has confirmed each detail. Only confirmed details can be sent.',
          Schema: { type: 'object', properties: { name: { type: 'boolean' }, email: { type: 'boolean' } } }
        },
        { Name: 'problem', Description: 'The latest problem in plain words, or empty.', Schema: { type: 'string' } }
      ],
      Verbs: [
        {
          Name: IDENTITY_VERIFICATION_VERBS.Fill,
          Description: 'Set the name or the email. What you fill is shown to the user marked as suggested until they confirm it.',
          ParametersSchema: {
            type: 'object',
            properties: { field: FIELD_PARAM, value: { type: 'string', description: 'The value to set.', maxLength: 200 } },
            required: ['field', 'value'],
            additionalProperties: false
          },
          InvokableBy: 'both'
        },
        {
          Name: IDENTITY_VERIFICATION_VERBS.Confirm,
          Description: 'Confirm the details shown. Only the user can do this.',
          ParametersSchema: { type: 'object', properties: { field: FIELD_PARAM }, additionalProperties: false },
          InvokableBy: 'user'
        },
        {
          Name: IDENTITY_VERIFICATION_VERBS.Submit,
          Description: 'Email the user a one-time code and link. Needs both details filled and confirmed by the user.',
          ParametersSchema: { type: 'object', additionalProperties: false },
          InvokableBy: 'both',
          Preconditions: ['name and email are filled', 'the user has confirmed both']
        },
        {
          Name: IDENTITY_VERIFICATION_VERBS.Resend,
          Description: 'Email a fresh code to the same address. Only after a code was sent, and subject to a short wait.',
          ParametersSchema: { type: 'object', additionalProperties: false },
          InvokableBy: 'both',
          Preconditions: ['a code was already sent']
        },
        {
          Name: IDENTITY_VERIFICATION_VERBS.EnterCode,
          Description: 'Submit the code the user received (digits as they gave them).',
          ParametersSchema: {
            type: 'object',
            properties: { code: { type: 'string', description: 'The code from the email.', maxLength: 16 } },
            required: ['code'],
            additionalProperties: false
          },
          InvokableBy: 'both',
          Preconditions: ['a code was sent']
        }
      ],
      Inputs: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'A name the host already knows, to pre-fill (the user still confirms it).' },
          email: { type: 'string', description: 'An email the host already knows, to pre-fill (the user still confirms it).' }
        },
        additionalProperties: false
      },
      Events: [
        { Name: 'field_filled', Description: 'A detail was filled in, by the agent or the user.' },
        { Name: 'confirmed', Description: 'The user confirmed one or both details.' },
        { Name: 'code_sent', Description: 'The server emailed a code and link.' },
        { Name: 'code_entered', Description: 'A code was submitted for checking (the code itself is never included).' },
        { Name: 'verified', Description: 'The server confirmed the person is verified.' },
        { Name: 'error', Description: 'A step failed; the payload carries the error code and the stage.' }
      ],
      Output: {
        type: 'object',
        properties: { verified: { type: 'boolean' }, email: { type: 'string' }, name: { type: 'string' } },
        required: ['verified', 'email', 'name']
      },
      DisplayPolicy: 'on-demand',
      DefaultAvailability: 'opt-in',
      MaxExposure: 'state'
    };
  }

  public override GetState(): JSONObject {
    return this.Model.ToState();
  }

  public override GetSurfaceComponent(): Type<IdentityVerificationSurfaceComponent> {
    return IdentityVerificationSurfaceComponent;
  }

  public override GetOnboardingDetails(): ChannelOnboardingDetails {
    return {
      Heading: 'Verify your identity',
      Description:
        'Confirm your name and email so we can recognise you. We email you a code and a link; either one completes it.',
      Tips: ['Check the details the assistant filled in, then press Confirm.', 'You can type the code here, or just open the link in the email.'],
      IconClass: 'fa-solid fa-user-shield'
    };
  }

  protected override OnInitialize(): void {
    this.Model.OnChange((change) => this.onModelChange(change));
    this.eventsSub = this.Context?.SessionEvents$?.subscribe((event) => {
      if (event.Type === 'identity.verified' && IsIdentityVerifiedEventPayload(event.Payload)) {
        this.Model.MarkVerified(event.Payload);
      }
    }) ?? null;
  }

  protected override OnOpen(inputs: JSONObject): void {
    this.Model.Seed(inputs);
  }

  public BindSurface(instance: IdentityVerificationSurfaceComponent): void {
    this.surface = instance;
    instance.Model = this.Model;
    instance.AgentName = this.Context?.AgentName ?? 'The assistant';
    instance.Dispatch = (verb, args) => this.ApplyVerb(verb, args, 'user');
  }

  public override UnbindSurface(): void {
    this.surface = null;
  }

  /** Runs one verb. The runtime already validated the call against the descriptor; confirm is guarded again here. */
  public override async ApplyVerb(
    verb: string,
    args: JSONObject,
    actor: RealtimeChannelActor,
    _instanceId?: string
  ): Promise<RealtimeChannelVerbResult> {
    switch (verb) {
      case IDENTITY_VERIFICATION_VERBS.Fill:
        return this.Model.Fill(args, actor);
      case IDENTITY_VERIFICATION_VERBS.Confirm:
        return this.Model.Confirm(args, actor);
      case IDENTITY_VERIFICATION_VERBS.Submit:
        return this.Model.Submit();
      case IDENTITY_VERIFICATION_VERBS.Resend:
        return this.Model.Resend();
      case IDENTITY_VERIFICATION_VERBS.EnterCode:
        return this.Model.EnterCode(args);
      default:
        return { Success: false, ErrorCode: 'unknown_verb', Error: `${this.ChannelName} has no verb "${verb}".` };
    }
  }

  public override Dispose(): void {
    this.eventsSub?.unsubscribe();
    this.eventsSub = null;
    this.Model.OnChange(null);
    this.surface = null;
    super.Dispose();
  }

  /** Records every change (events immediately, one coalesced note to the model) and completes on verification. */
  private onModelChange(change: IdentityVerificationChange): void {
    if (change.Event) {
      this.EmitChannelEvent(change.Event.Name, change.Event.Payload);
    }
    this.RecordChange({ Author: change.Author });
    if (change.Event?.Name === 'verified') {
      const view = this.Model.View;
      this.Complete({ verified: true, email: view.Email.Value, name: view.Name.Value });
    }
  }

  /**
   * The server calls, riding the session's own provider and live session id. `null` when the session has
   * no GraphQL provider — the channel then refuses to send rather than pretending.
   */
  private createService(): IdentityVerificationService | null {
    return {
      Request: (input) => this.withClient((client, id) => client.RequestVerification({ AgentSessionID: id, Name: input.Name, Email: input.Email })),
      SubmitCode: (code) => this.withClient((client, id) => client.SubmitVerificationCode({ AgentSessionID: id, Code: code }))
    };
  }

  private async withClient<T extends { Success: boolean }>(
    run: (client: GraphQLRealtimeSessionClient, agentSessionId: string) => Promise<T>
  ): Promise<T | NoSessionResult> {
    const provider = this.Context?.Provider as GraphQLDataProvider | null | undefined;
    const sessionId = this.Context?.AgentSessionID ?? null;
    if (!provider || !sessionId) {
      return { Success: false, VerificationState: 'unverified', ErrorCode: 'session_not_found' };
    }
    return run(this.createVerificationClient(provider), sessionId);
  }

  /** Builds the transport; protected so a test (or a host on another transport) can substitute it. */
  protected createVerificationClient(provider: GraphQLDataProvider): GraphQLRealtimeSessionClient {
    return new GraphQLRealtimeSessionClient(provider);
  }
}

/** The shape returned when there is no live session to talk to (mirrors the client's own failure results). */
interface NoSessionResult {
  Success: false;
  VerificationState: 'unverified';
  ErrorCode: 'session_not_found';
}

/**
 * Tree-shaking prevention: the channel is resolved through the ClassFactory by the registry row's
 * `ClientPluginClass` key, so this static call keeps its `@RegisterClass` side effect alive.
 */
export function LoadIdentityVerificationChannel(): void {
  // intentional no-op — the import side effect performs the registration
}
