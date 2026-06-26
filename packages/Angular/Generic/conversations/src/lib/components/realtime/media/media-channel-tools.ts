import { RealtimeToolDefinition } from '@memberjunction/ai';

/**
 * The shared name prefix of every Media-channel tool — the key the session registers so all
 * `Media_*` tool calls route locally to {@link RealtimeMediaChannel.ApplyAgentTool} (executed in
 * the browser, mutating the channel's {@link MediaChannelState}) instead of the generic server
 * tool relay. Mirrors `Whiteboard_` / `browser_`.
 */
export const MEDIA_TOOL_PREFIX = 'Media_';

/** The canonical Media tool names (one per `Media_*` capability). */
export const MEDIA_TOOL_NAMES = {
  ShowMedia: 'Media_ShowMedia',
  CloseMedia: 'Media_CloseMedia',
  PlayMedia: 'Media_PlayMedia',
  Highlight: 'Media_Highlight',
  ClearAll: 'Media_ClearAll',
} as const;

/**
 * The Media channel's CLIENT-EXECUTED tool declarations — registered with the realtime model at
 * session mint and routed back to {@link RealtimeMediaChannel.ApplyAgentTool} by the `Media_`
 * prefix. They let the agent put visuals (images, video, audio, PDFs, web pages) on the shared
 * Media surface during the call, switch between them, highlight a region, and clear the board.
 */
export const MEDIA_TOOL_DEFINITIONS: RealtimeToolDefinition[] = [
  {
    Name: MEDIA_TOOL_NAMES.ShowMedia,
    Description:
      'Display a piece of media on the shared Media surface the user is watching during the call — ' +
      'an image, video, audio clip, PDF, or web page. It opens in its own tab and becomes the active ' +
      'pane. Provide `url` for an external/public asset, OR `fileId` to show a file stored in ' +
      'MemberJunction (streamed securely, permission-gated) — supply at least one. Returns the new ' +
      'item id so you can later play, highlight, or close it.',
    ParametersSchema: {
      type: 'object',
      properties: {
        mediaType: {
          type: 'string',
          enum: ['image', 'video', 'audio', 'pdf', 'web'],
          description: 'The kind of media to display.',
        },
        url: {
          type: 'string',
          description:
            'Absolute URL of an external/public media asset (include the scheme, e.g. https://…). ' +
            'Provide this OR `fileId`.',
        },
        fileId: {
          type: 'string',
          description:
            'Id of an "MJ: Files" record to show a file stored in MemberJunction — streamed securely ' +
            'and permission-gated (no public URL needed). Provide this OR `url`.',
        },
        displayName: {
          type: 'string',
          description: 'Short label shown on the media\'s tab (e.g. "Q3 Revenue Chart").',
        },
        caption: {
          type: 'string',
          description: 'Optional one-line caption shown beneath the media.',
        },
      },
      required: ['mediaType', 'displayName'],
    },
  },
  {
    Name: MEDIA_TOOL_NAMES.CloseMedia,
    Description: 'Close one piece of media (by its id) and remove its tab from the Media surface.',
    ParametersSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The id of the media item to close (returned by Media_ShowMedia).' },
      },
      required: ['id'],
    },
  },
  {
    Name: MEDIA_TOOL_NAMES.PlayMedia,
    Description:
      'Make a piece of media active (bring its tab to the front) and, for video/audio, request playback. ' +
      'Use this to direct the user\'s attention to something already shared.',
    ParametersSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The id of the media item to activate / play.' },
      },
      required: ['id'],
    },
  },
  {
    Name: MEDIA_TOOL_NAMES.Highlight,
    Description:
      'Draw a highlight rectangle over a region of a media item to point at something specific. ' +
      'Coordinates are FRACTIONAL (0..1) relative to the media\'s own box: x,y is the top-left corner, ' +
      'w,h are the width/height. Replaces any prior highlight on that item.',
    ParametersSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The id of the media item to highlight.' },
        x: { type: 'number', description: 'Left edge as a fraction of width (0..1).' },
        y: { type: 'number', description: 'Top edge as a fraction of height (0..1).' },
        w: { type: 'number', description: 'Width as a fraction of width (0..1).' },
        h: { type: 'number', description: 'Height as a fraction of height (0..1).' },
        label: { type: 'string', description: 'Optional short label shown on the highlight.' },
      },
      required: ['id', 'x', 'y', 'w', 'h'],
    },
  },
  {
    Name: MEDIA_TOOL_NAMES.ClearAll,
    Description: 'Remove all media from the Media surface, returning it to its empty state.',
    ParametersSchema: { type: 'object', properties: {} },
  },
];
