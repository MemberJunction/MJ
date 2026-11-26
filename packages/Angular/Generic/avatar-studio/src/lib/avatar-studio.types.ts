export type AvatarStudioTab = 'ai' | 'icon' | 'upload';

export interface AvatarIconOption {
  IconClass: string;
  Label: string;
}

export interface AvatarAccentColorOption {
  Value: string;
  Label: string;
}

export interface AvatarChangeEvent {
  /** Data URI or image URL when in image mode; empty string when in icon mode. */
  ImageUrl: string;
  /** Font Awesome icon class string (e.g. `fa-solid fa-wand-magic-sparkles`). */
  IconClass: string;
  /** Optional hex/CSS accent color (null when unset). */
  AccentColor: string | null;
}

/**
 * Optional callback supplied by hosts to synthesize a contextual AI image prompt
 * from domain metadata (agent role, community space name, user bio, etc.).
 */
export type AvatarPromptBuilder = (stylePreset: string) => string;

export interface CachedAvatarPngSource {
  DataUri: string;
  PngBase64: string;
}

export interface AvatarGenerationResult {
  Success: boolean;
  DataUrl?: string;
  RawPngBase64?: string | null;
  ErrorMessage?: string;
}

export const AVATAR_GENERATE_IMAGE_ACTION_NAME = 'Generate Image';
export const AVATAR_GENERATE_IMAGE_FALLBACK_ID = '048FF309-C2CD-44D8-8A8E-8C771ADA8284';
export const AVATAR_CANVAS_SIZE = 128;
export const AVATAR_REFINE_PNG_SIZE = 256;
export const AVATAR_WEBP_QUALITY = 0.85;
export const MAX_AVATAR_HISTORY = 10;

export const DEFAULT_AVATAR_ICON_OPTIONS: readonly AvatarIconOption[] = [
  { IconClass: 'fa-solid fa-pepper-hot', Label: 'Pepper' },
  { IconClass: 'fa-solid fa-bolt', Label: 'Bolt' },
  { IconClass: 'fa-solid fa-chess-knight', Label: 'Strategist' },
  { IconClass: 'fa-solid fa-compass', Label: 'Compass' },
  { IconClass: 'fa-solid fa-brain', Label: 'Brain' },
  { IconClass: 'fa-solid fa-rocket', Label: 'Rocket' },
  { IconClass: 'fa-solid fa-wand-magic-sparkles', Label: 'Sparkles' },
  { IconClass: 'fa-solid fa-shield-halved', Label: 'Shield' },
  { IconClass: 'fa-solid fa-microscope', Label: 'Research' },
  { IconClass: 'fa-solid fa-database', Label: 'Data' },
  { IconClass: 'fa-solid fa-chart-line', Label: 'Analytics' },
  { IconClass: 'fa-solid fa-feather-pointed', Label: 'Writer' },
];

export const DEFAULT_AVATAR_STYLE_PRESETS: readonly string[] = [
  '3D Clay Mascot',
  'Minimal Geometric',
  'Flat Vector Badge',
  'Cyberpunk Bot',
  'Watercolor Portrait',
];

export const DEFAULT_AVATAR_QUICK_REFINEMENTS: readonly string[] = [
  'Add sleek glasses',
  'Make background teal',
  'Warm gold accent rim',
  'Cleaner minimalist flat style',
];

export const DEFAULT_AVATAR_ACCENT_COLORS: readonly AvatarAccentColorOption[] = [
  { Value: '#2563EB', Label: 'Ocean Blue' },
  { Value: '#7C3AED', Label: 'Violet' },
  { Value: '#0D9488', Label: 'Teal' },
  { Value: '#16A34A', Label: 'Emerald' },
  { Value: '#D97706', Label: 'Amber' },
  { Value: '#E11D48', Label: 'Rose' },
  { Value: '#EA580C', Label: 'Tangerine' },
  { Value: '#475569', Label: 'Slate' },
];
