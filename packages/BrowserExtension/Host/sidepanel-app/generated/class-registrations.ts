/**
 * @fileoverview Class registration manifest for the standalone MemberJunction Browser Extension
 * Angular 21 Side Panel application (`@memberjunction/browser-extension-host`).
 *
 * Retains all `@RegisterClass` decorated classes needed by:
 * - `@memberjunction/core` & `@memberjunction/core-entities`
 * - `@memberjunction/ai-core-plus` & `@memberjunction/ai-engine-base`
 * - `@memberjunction/ai-realtime-client` & `@memberjunction/ai-vectors-memory`
 * - `@memberjunction/ng-artifacts` & `@memberjunction/ng-conversations`
 * - `@memberjunction/browser-extension-core` (`LocalBrowserChannel`, `StandardPageExtractor`, `LinkedInPageExtractor`)
 *
 * Deliberately excludes `MJExplorer` (`@memberjunction/ng-explorer-core`, dashboards, entity forms)
 * so the Side Panel bundle remains a focused, fast-booting widget application.
 */

import * as CoreEntities from '@memberjunction/core-entities';
import { SaveEntityGraphOperation } from '@memberjunction/core';
import {
  AssemblyAIRealtimeClient,
  ElevenLabsRealtimeClient,
  ElevenRealtimeClient,
  GeminiEnterpriseRealtimeClient,
  GeminiRealtimeClient,
  HuggingFaceRealtimeClient,
  OpenAILiveClient,
  OpenAIRealtimeClient,
  xAIRealtimeClient,
} from '@memberjunction/ai-realtime-client';
import {
  BaseVectorAccelerator,
  SimpleVectorDatabase,
  SimpleVectorServiceProvider,
} from '@memberjunction/ai-vectors-memory';
import {
  MJAIAgentEntityExtended,
  MJAIAgentRunEntityExtended,
  MJAIAgentRunStepEntityExtended,
  MJAIModelEntityExtended,
  MJAIPromptCategoryEntityExtended,
  MJAIPromptEntityExtended,
  MJAIPromptRunEntityExtended,
  MJEntityDocumentEntityExtended,
} from '@memberjunction/ai-core-plus';
import {
  LinearPriceUnitType,
  MJAICredentialBindingEntityExtended,
  PerHundredThousandTokensPriceUnitType,
  PerImagePriceUnitType,
  PerMillionTokensPriceUnitType,
  PerThousandTokensPriceUnitType,
  TimePerHourPriceUnitType,
  TimePerMinutePriceUnitType,
} from '@memberjunction/ai-engine-base';
import {
  AudioArtifactViewerComponent,
  CodeArtifactViewerComponent,
  ComponentArtifactViewerComponent,
  DataArtifactViewerComponent,
  DocxArtifactViewerComponent,
  HtmlArtifactViewerComponent,
  ImageArtifactViewerComponent,
  JsonArtifactViewerComponent,
  MLExperimentResultsViewerComponent,
  MarkdownArtifactViewerComponent,
  PdfArtifactViewerComponent,
  SvgArtifactViewerComponent,
  VideoArtifactViewerComponent,
  VideoProductionViewerComponent,
  XlsxArtifactViewerComponent,
} from '@memberjunction/ng-artifacts';
import {
  AgentMentionProvider,
  ClientContextChannel,
  IdentityVerificationChannel,
  InteractiveComponentChannel,
  RealtimeAvatarChannel,
  RealtimeCameraChannel,
  RealtimeMediaChannel,
  RealtimeScreenShareChannel,
  RealtimeWhiteboardChannel,
  RecordMentionProvider,
  RemoteBrowserChannel,
  SkillCommandProvider,
  WhiteboardArtifactViewerComponent,
} from '@memberjunction/ng-conversations';
import {
  LinkedInPageExtractor,
  LocalBrowserChannel,
  StandardPageExtractor,
} from '@memberjunction/browser-extension-core';

export const SIDE_PANEL_REGISTERED_CLASS_NAMES: ReadonlyArray<string> = [
  String(Object.keys(CoreEntities).length),
  SaveEntityGraphOperation.name,
  AssemblyAIRealtimeClient.name,
  ElevenLabsRealtimeClient.name,
  ElevenRealtimeClient.name,
  GeminiEnterpriseRealtimeClient.name,
  GeminiRealtimeClient.name,
  HuggingFaceRealtimeClient.name,
  OpenAILiveClient.name,
  OpenAIRealtimeClient.name,
  xAIRealtimeClient.name,
  BaseVectorAccelerator.name,
  SimpleVectorDatabase.name,
  SimpleVectorServiceProvider.name,
  MJAIAgentEntityExtended.name,
  MJAIAgentRunEntityExtended.name,
  MJAIAgentRunStepEntityExtended.name,
  MJAIModelEntityExtended.name,
  MJAIPromptCategoryEntityExtended.name,
  MJAIPromptEntityExtended.name,
  MJAIPromptRunEntityExtended.name,
  MJEntityDocumentEntityExtended.name,
  LinearPriceUnitType.name,
  MJAICredentialBindingEntityExtended.name,
  PerHundredThousandTokensPriceUnitType.name,
  PerImagePriceUnitType.name,
  PerMillionTokensPriceUnitType.name,
  PerThousandTokensPriceUnitType.name,
  TimePerHourPriceUnitType.name,
  TimePerMinutePriceUnitType.name,
  AudioArtifactViewerComponent.name,
  CodeArtifactViewerComponent.name,
  ComponentArtifactViewerComponent.name,
  DataArtifactViewerComponent.name,
  DocxArtifactViewerComponent.name,
  HtmlArtifactViewerComponent.name,
  ImageArtifactViewerComponent.name,
  JsonArtifactViewerComponent.name,
  MLExperimentResultsViewerComponent.name,
  MarkdownArtifactViewerComponent.name,
  PdfArtifactViewerComponent.name,
  SvgArtifactViewerComponent.name,
  VideoArtifactViewerComponent.name,
  VideoProductionViewerComponent.name,
  XlsxArtifactViewerComponent.name,
  AgentMentionProvider.name,
  ClientContextChannel.name,
  IdentityVerificationChannel.name,
  InteractiveComponentChannel.name,
  RealtimeAvatarChannel.name,
  RealtimeCameraChannel.name,
  RealtimeMediaChannel.name,
  RealtimeScreenShareChannel.name,
  RealtimeWhiteboardChannel.name,
  RecordMentionProvider.name,
  RemoteBrowserChannel.name,
  SkillCommandProvider.name,
  WhiteboardArtifactViewerComponent.name,
  LinkedInPageExtractor.name,
  LocalBrowserChannel.name,
  StandardPageExtractor.name,
];
