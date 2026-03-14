import { LogoGradient } from '@memberjunction/ng-shared-generic';

/**
 * Available animation types for the loading screen.
 */
export type LoadingAnimationType = 'pulse' | 'spin' | 'bounce' | 'pulse-spin';

/**
 * Configuration for an animation step in a sequence.
 */
export interface AnimationStep {
  /** The animation type to use */
  type: LoadingAnimationType;

  /**
   * Duration in milliseconds for this animation step.
   * If not specified or 0, this animation runs for the remainder of loading.
   * Use this to create sequences like: bounce for 5s, then pulse for the rest.
   */
  durationMs?: number;
}

/**
 * Configuration for a seasonal loading theme.
 * Themes are selected based on date range and optionally locale.
 */
export interface LoadingTheme {
  /** Unique identifier for the theme */
  id: string;

  /** Human-readable name for the theme */
  name: string;

  /** Month (1-12) and day when this theme starts */
  startsAt: { month: number; day: number };

  /** Month (1-12) and day when this theme ends (inclusive) */
  endsAt: { month: number; day: number };

  /**
   * Optional locale codes where this theme applies.
   * Uses BCP 47 language tags (e.g., 'en-US', 'en-CA', 'es-MX').
   * If undefined or empty, theme applies globally.
   * Can include partial matches (e.g., 'en' matches 'en-US', 'en-GB', etc.)
   */
  locales?: string[];

  /**
   * Array of theme colors used for the logo and text.
   * Colors are cycled through as loading progresses.
   * For the standard theme, only the first color is used (no changes).
   */
  colors: string[];

  /**
   * Optional array of gradient configurations for the logo.
   * When set, gradients are alternated through as loading progresses.
   * Takes precedence over solid colors for the logo fill.
   * If only one gradient is provided, it's used throughout.
   */
  gradients?: LogoGradient[];

  /**
   * Array of themed messages to display during loading.
   * Should contain at least 25 messages for variety.
   */
  messages: string[];

  /**
   * Priority for theme selection when multiple themes match.
   * Higher priority themes are selected over lower priority ones.
   * Default is 0. More specific themes (e.g., regional) should have higher priority.
   */
  priority?: number;

  /**
   * If true, colors and gradients remain fixed (no cycling).
   * Used for standard theme to keep MJ blue throughout.
   */
  staticColors?: boolean;

  /**
   * Animation configuration for this theme.
   * Can be a single animation type (string) or an array of AnimationSteps for sequences.
   *
   * Examples:
   * - 'pulse' - Use pulse animation throughout
   * - [{ type: 'bounce', durationMs: 5000 }, { type: 'pulse' }] - Bounce for 5s, then pulse
   * - [{ type: 'spin', durationMs: 3000 }, { type: 'pulse-spin', durationMs: 3000 }, { type: 'pulse' }]
   *
   * If not specified, defaults to 'pulse' for standard theme or random selection for others.
   */
  animations?: LoadingAnimationType | AnimationStep[];
}

/**
 * Standard (default) theme used when no seasonal theme applies.
 * Keeps MJ blue throughout loading with no color changes.
 */
export const STANDARD_THEME: LoadingTheme = {
  id: 'standard',
  name: 'Standard',
  startsAt: { month: 1, day: 1 },
  endsAt: { month: 12, day: 31 },
  staticColors: true, // Keep MJ blue the whole time
  animations: 'pulse', // Calm, professional pulse animation only
  colors: [
    '', // Uses --mj-logo-color CSS variable (adapts to theme)
  ],
  messages: [
    'Loading workspace...',
    'Warming up the engines... 🚀',
    'Fetching your applications...',
    'Preparing your dashboards... 📊',
    'Connecting the dots...',
    'Almost there... ⏳',
    'Loading your favorites...',
    'Syncing your workspace... 🔄',
    'Initializing components...',
    'Getting things ready...',
    'Just a moment... ⌛',
    'Brewing some magic... ✨',
    'Polishing the interface...',
    'Loading your data... 📦',
    'Configuring your experience...',
    'Hang tight... 🎯',
    'Spinning up resources...',
    'Preparing your view... 👀',
    'Loading configurations...',
    'Setting up your environment... ⚙️',
    'Gathering your tools... 🔧',
    'Assembling the pieces...',
    'Checking permissions... 🔐',
    'Loading preferences...',
    'Almost ready to go... 🏁',
  ],
};

/**
 * Winter Holiday theme (December 1-31) - Global
 * Uses alternating Red→Green and Green→Red gradients
 */
export const WINTER_HOLIDAY_THEME: LoadingTheme = {
  id: 'winter-holiday',
  name: 'Winter Holidays',
  startsAt: { month: 12, day: 1 },
  endsAt: { month: 12, day: 31 },
  // Festive bounce to start, then gentle pulse
  animations: [
    { type: 'bounce', durationMs: 4000 },
    { type: 'pulse' }
  ],
  colors: [
    '#C41E3A', // Christmas Red
    '#228B22', // Forest Green
    '#FFD700', // Gold
    '#87CEEB', // Sky Blue (icy)
    '#8B4513', // Saddle Brown (cozy)
  ],
  gradients: [
    { startColor: '#C41E3A', endColor: '#228B22', angle: 45 }, // Red to Green
    { startColor: '#228B22', endColor: '#C41E3A', angle: 45 }, // Green to Red
    { startColor: '#C41E3A', endColor: '#FFD700', angle: 45 }, // Red to Gold
    { startColor: '#FFD700', endColor: '#228B22', angle: 45 }, // Gold to Green
    { startColor: '#87CEEB', endColor: '#C41E3A', angle: 45 }, // Ice Blue to Red
  ],
  messages: [
    'Loading workspace...',
    'Happy Holidays! 🎄',
    'Spreading holiday cheer... ✨',
    'Warming up by the fire... 🔥',
    'Unwrapping your workspace... 🎁',
    'Jingling all the way... 🔔',
    'Decking the halls...',
    'Making spirits bright... ⭐',
    'Dashing through the data... 🦌',
    'Wrapping up the details...',
    "Season's greetings! ❄️",
    'Cozy loading vibes... ☕',
    'Frosting the interface...',
    'Lighting up your workspace... 💡',
    'Holiday magic loading... ✨',
    'Almost ready to celebrate... 🎉',
    'Spreading warmth and joy...',
    'Twinkling with excitement... ⭐',
    'Gathering around the data...',
    'Festive preparations underway... 🎄',
    'Making memories load...',
    'Warming your workspace...',
    'Sprinkling holiday dust... ✨',
    'Preparing your gift... 🎁',
    'Joy is loading... 😊',
  ],
};

/**
 * New Year theme (December 31 - January 2) - Global
 */
export const NEW_YEAR_THEME: LoadingTheme = {
  id: 'new-year',
  name: 'New Year',
  startsAt: { month: 12, day: 31 },
  endsAt: { month: 1, day: 2 },
  priority: 10, // Higher priority than Winter Holiday
  // Exciting spin for countdown feel, then celebratory pulse-spin
  animations: [
    { type: 'spin', durationMs: 3000 },
    { type: 'pulse-spin', durationMs: 4000 },
    { type: 'pulse' }
  ],
  colors: [
    '#FFD700', // Gold
    '#C0C0C0', // Silver
    '#4169E1', // Royal Blue
    '#9400D3', // Dark Violet
    '#FF1493', // Deep Pink
  ],
  gradients: [
    { startColor: '#FFD700', endColor: '#C0C0C0', angle: 135 }, // Gold to Silver
    { startColor: '#C0C0C0', endColor: '#FFD700', angle: 135 }, // Silver to Gold
    { startColor: '#FFD700', endColor: '#4169E1', angle: 135 }, // Gold to Blue
    { startColor: '#4169E1', endColor: '#9400D3', angle: 135 }, // Blue to Violet
    { startColor: '#9400D3', endColor: '#FF1493', angle: 135 }, // Violet to Pink
  ],
  messages: [
    'Loading workspace...',
    'Happy New Year! 🎆',
    'New year, new possibilities... ✨',
    'Counting down to greatness... ⏰',
    'Popping the confetti... 🎊',
    'Cheers to new beginnings! 🥂',
    'Ringing in the new year... 🔔',
    'Fresh start loading... 🌟',
    'Making resolutions...',
    'Celebrating new opportunities... 🎉',
    'Sparkling with anticipation... ✨',
    'A fresh chapter begins... 📖',
    'Toasting to success... 🥂',
    "Here's to a great year! 🎆",
    'New adventures await... 🚀',
    'Loading your best year yet...',
    'Fireworks of data... 🎇',
    'Midnight magic... 🌙',
    'Starting fresh...',
    'New horizons loading... 🌅',
    'Embracing the future...',
    'Ready for amazing things... ⭐',
    'A blank canvas awaits... 🎨',
    'Possibilities are endless... ♾️',
    'Your year is loading... 📅',
  ],
};

/**
 * Halloween theme (October 15-31) - Global
 */
export const HALLOWEEN_THEME: LoadingTheme = {
  id: 'halloween',
  name: 'Halloween',
  startsAt: { month: 10, day: 15 },
  endsAt: { month: 10, day: 31 },
  // Spooky slow pulse-spin, then eerie pulse
  animations: [
    { type: 'pulse-spin', durationMs: 5000 },
    { type: 'pulse' }
  ],
  colors: [
    '#FF6600', // Pumpkin Orange
    '#8B008B', // Dark Magenta
    '#2E8B57', // Sea Green (witchy)
    '#800080', // Purple
    '#000000', // Black
  ],
  gradients: [
    { startColor: '#FF6600', endColor: '#8B008B', angle: 45 }, // Orange to Magenta
    { startColor: '#8B008B', endColor: '#FF6600', angle: 45 }, // Magenta to Orange
    { startColor: '#FF6600', endColor: '#000000', angle: 45 }, // Orange to Black
    { startColor: '#800080', endColor: '#2E8B57', angle: 45 }, // Purple to Green
    { startColor: '#2E8B57', endColor: '#FF6600', angle: 45 }, // Green to Orange
  ],
  messages: [
    'Loading workspace...',
    'Summoning your data... 🔮',
    'Brewing a spooky potion... 🧙',
    'Creeping through the code...',
    'Trick or treat! 🎃',
    'Haunting your workspace... 👻',
    'Carving out some time... 🎃',
    'Spooky loading noises... 💀',
    'Conjuring your dashboards... ✨',
    'Ghostly preparations... 👻',
    'Waking the monsters...',
    'Something wicked loading... 🦇',
    'Boo! Almost there... 👻',
    'Cackling with excitement...',
    'Enchanting your experience... 🔮',
    'The witching hour approaches... 🌙',
    'Stirring the cauldron... 🧪',
    'Unleashing the spirits...',
    'Cobwebs are clearing... 🕸️',
    'Moonlight loading... 🌕',
    'Creaky doors opening...',
    'Pumpkins are glowing... 🎃',
    'Bats are flying... 🦇',
    'Spine-tingling preparations...',
    'Eerie data emerging... 💀',
  ],
};

/**
 * Valentine's Day theme (February 1-14) - Global
 */
export const VALENTINES_THEME: LoadingTheme = {
  id: 'valentines',
  name: "Valentine's Day",
  startsAt: { month: 2, day: 1 },
  endsAt: { month: 2, day: 14 },
  // Heartbeat-like pulse throughout
  animations: 'pulse',
  colors: [
    '#FF69B4', // Hot Pink
    '#DC143C', // Crimson
    '#FFB6C1', // Light Pink
    '#C71585', // Medium Violet Red
    '#FF1493', // Deep Pink
  ],
  gradients: [
    { startColor: '#FF69B4', endColor: '#DC143C', angle: 45 }, // Hot Pink to Crimson
    { startColor: '#DC143C', endColor: '#FF69B4', angle: 45 }, // Crimson to Hot Pink
    { startColor: '#FFB6C1', endColor: '#C71585', angle: 45 }, // Light Pink to Violet Red
    { startColor: '#C71585', endColor: '#FF1493', angle: 45 }, // Violet Red to Deep Pink
    { startColor: '#FF1493', endColor: '#FFB6C1', angle: 45 }, // Deep Pink to Light Pink
  ],
  messages: [
    'Loading workspace...',
    'Hearts are loading... 💕',
    'Cupid is on the way... 💘',
    'Sweet things coming... 🍫',
    'Roses are loading... 🌹',
    'Be mine, almost ready... 💝',
    'Chocolate loading... 🍫',
    'Heart-shaped preparations... 💖',
    'Romance in progress... 💑',
    'XOXO loading... 😘',
    'Sweet nothings compiling... 💌',
    'Heartfelt data incoming... 💗',
    'Candy hearts loading... 🍬',
    'Affection initializing... 💓',
    'Tenderness loading...',
    'Sweet surprises ahead... 🎁',
    'Butterflies are loading... 🦋',
    'Warm fuzzies incoming... 💕',
    'Smitten with data... 💘',
    'Adoring your workspace... 💖',
  ],
};

/**
 * St. Patrick's Day theme (March 14-17) - Global
 */
export const ST_PATRICKS_THEME: LoadingTheme = {
  id: 'st-patricks',
  name: "St. Patrick's Day",
  startsAt: { month: 3, day: 14 },
  endsAt: { month: 3, day: 17 },
  // Lucky bounce, then pulse
  animations: [
    { type: 'bounce', durationMs: 3000 },
    { type: 'pulse' }
  ],
  colors: [
    '#228B22', // Forest Green
    '#32CD32', // Lime Green
    '#FFD700', // Gold
    '#006400', // Dark Green
    '#90EE90', // Light Green
  ],
  gradients: [
    { startColor: '#228B22', endColor: '#FFD700', angle: 45 }, // Forest Green to Gold
    { startColor: '#FFD700', endColor: '#228B22', angle: 45 }, // Gold to Forest Green
    { startColor: '#32CD32', endColor: '#006400', angle: 45 }, // Lime to Dark Green
    { startColor: '#006400', endColor: '#90EE90', angle: 45 }, // Dark to Light Green
    { startColor: '#90EE90', endColor: '#FFD700', angle: 45 }, // Light Green to Gold
  ],
  messages: [
    'Loading workspace...',
    'Feeling lucky... 🍀',
    'Finding the pot of gold... 🌈',
    'Shamrocks are loading... ☘️',
    'Top of the morning! ☀️',
    'Luck of the Irish... 🍀',
    'Chasing rainbows... 🌈',
    'Green with excitement...',
    'Leprechaun approved... 🎩',
    'Four-leaf clover found... 🍀',
    'Irish eyes are smiling... 😊',
    'Lucky charms loading... ⭐',
    'Emerald data incoming... 💎',
    'Slainte! Loading... 🍺',
    'Golden treasures loading... 🪙',
    'Celtic magic brewing... ✨',
    'Lucky stars aligning... ⭐',
    'Pot of gold discovered... 🌈',
    'Green beer loading... 🍺',
    'Jig is loading... 💃',
    'Blarney stone touched...',
    'Lucky loading... 🍀',
    'Fortunes are loading...',
    'Magically delicious... ✨',
  ],
};

/**
 * Spring theme (March 20 - April 15) - Global
 */
export const SPRING_THEME: LoadingTheme = {
  id: 'spring',
  name: 'Spring',
  startsAt: { month: 3, day: 20 },
  endsAt: { month: 4, day: 15 },
  // Fresh, light bounce then gentle pulse
  animations: [
    { type: 'bounce', durationMs: 3000 },
    { type: 'pulse' }
  ],
  colors: [
    '#98FB98', // Pale Green
    '#FFB6C1', // Light Pink
    '#87CEEB', // Sky Blue
    '#DDA0DD', // Plum
    '#F0E68C', // Khaki (sunny)
    '#FFA07A', // Light Salmon
  ],
  gradients: [
    { startColor: '#98FB98', endColor: '#FFB6C1', angle: 45 }, // Green to Pink
    { startColor: '#FFB6C1', endColor: '#87CEEB', angle: 45 }, // Pink to Sky Blue
    { startColor: '#87CEEB', endColor: '#DDA0DD', angle: 45 }, // Sky Blue to Plum
    { startColor: '#DDA0DD', endColor: '#F0E68C', angle: 45 }, // Plum to Sunny
    { startColor: '#F0E68C', endColor: '#FFA07A', angle: 45 }, // Sunny to Salmon
    { startColor: '#FFA07A', endColor: '#98FB98', angle: 45 }, // Salmon to Green
  ],
  messages: [
    'Loading workspace...',
    'Spring is in the air... 🌸',
    'Flowers are blooming... 🌷',
    'Birds are singing... 🐦',
    'Fresh beginnings... 🌱',
    'Sunny days ahead... ☀️',
    'Butterflies loading... 🦋',
    'April showers loading... 🌧️',
    'New growth emerging... 🌿',
    'Blossoms are opening... 🌺',
    'Spring cleaning data... 🧹',
    'Buzzing with activity... 🐝',
    'Nature is awakening... 🌳',
    'Fresh air loading... 💨',
    'Rainbow after rain... 🌈',
    'Chirping preparations... 🐤',
    'Planting seeds of data... 🌱',
    'Springing into action... 🏃',
    'Garden of data growing... 🌻',
    'Warmth is returning... ☀️',
    'Eggs are hatching... 🐣',
    'Bunny hop loading... 🐰',
    'Renewal in progress... 🔄',
    'Pastel dreams loading... 🎨',
    'Spring forward... ⏰',
  ],
};

/**
 * Thanksgiving theme (November 1-30) - US
 */
export const THANKSGIVING_US_THEME: LoadingTheme = {
  id: 'thanksgiving-us',
  name: 'Thanksgiving (US)',
  startsAt: { month: 11, day: 1 },
  endsAt: { month: 11, day: 30 },
  locales: ['en-US'],
  // Warm, cozy pulse throughout
  animations: 'pulse',
  colors: [
    '#D2691E', // Chocolate (brown)
    '#FF8C00', // Dark Orange
    '#8B4513', // Saddle Brown
    '#DAA520', // Goldenrod
    '#CD853F', // Peru
    '#B22222', // Firebrick (cranberry)
  ],
  gradients: [
    { startColor: '#D2691E', endColor: '#FF8C00', angle: 45 }, // Brown to Orange
    { startColor: '#FF8C00', endColor: '#D2691E', angle: 45 }, // Orange to Brown
    { startColor: '#8B4513', endColor: '#DAA520', angle: 45 }, // Saddle to Gold
    { startColor: '#DAA520', endColor: '#CD853F', angle: 45 }, // Gold to Peru
    { startColor: '#CD853F', endColor: '#B22222', angle: 45 }, // Peru to Cranberry
    { startColor: '#B22222', endColor: '#FF8C00', angle: 45 }, // Cranberry to Orange
  ],
  messages: [
    'Loading workspace...',
    'Giving thanks... 🙏',
    'Harvest time loading... 🌾',
    'Turkey is in the oven... 🦃',
    'Grateful for you... 💛',
    'Fall feast preparing... 🍂',
    'Pumpkin pie loading... 🥧',
    'Counting blessings... ✨',
    'Autumn leaves falling... 🍁',
    'Family gathering... 👨‍👩‍👧‍👦',
    'Cornucopia of data... 🎃',
    'Thankful preparations...',
    'Gobble gobble loading... 🦃',
    'Cranberry sauce ready...',
    'Stuffing the data... 🍞',
    'Warm and cozy loading... 🧣',
    'Harvest moon rising... 🌕',
    'Gratitude loading... 💛',
    'Pilgrim progress...',
    'Feast is preparing... 🍽️',
    'Apple cider warming... 🍎',
    'Leaves are crunching... 🍂',
    'Sweater weather loading... 🧶',
    'Hayride in progress... 🚜',
    'Thankful vibes only... 🙏',
  ],
};

/**
 * Canadian Thanksgiving theme (October 1-14) - Canada
 */
export const THANKSGIVING_CA_THEME: LoadingTheme = {
  id: 'thanksgiving-ca',
  name: 'Thanksgiving (Canada)',
  startsAt: { month: 10, day: 1 },
  endsAt: { month: 10, day: 14 },
  locales: ['en-CA', 'fr-CA'],
  // Warm, cozy pulse throughout
  animations: 'pulse',
  colors: [
    '#D2691E', // Chocolate (brown)
    '#FF8C00', // Dark Orange
    '#8B4513', // Saddle Brown
    '#DAA520', // Goldenrod
    '#CD853F', // Peru
    '#C41E3A', // Maple red
  ],
  gradients: [
    { startColor: '#C41E3A', endColor: '#FF8C00', angle: 45 }, // Maple to Orange
    { startColor: '#FF8C00', endColor: '#C41E3A', angle: 45 }, // Orange to Maple
    { startColor: '#D2691E', endColor: '#DAA520', angle: 45 }, // Brown to Gold
    { startColor: '#DAA520', endColor: '#8B4513', angle: 45 }, // Gold to Saddle
    { startColor: '#8B4513', endColor: '#CD853F', angle: 45 }, // Saddle to Peru
  ],
  messages: [
    'Loading workspace...',
    'Giving thanks, eh... 🙏',
    'Harvest time loading... 🌾',
    'Turkey is roasting... 🦃',
    'Grateful for you... 💛',
    'Fall feast preparing... 🍂',
    'Pumpkin pie loading... 🥧',
    'Counting blessings... ✨',
    'Maple leaves falling... 🍁',
    'Family gathering... 👨‍👩‍👧‍👦',
    'Cornucopia of data... 🎃',
    'Thankful preparations...',
    'Gobble gobble loading... 🦃',
    'Cranberry sauce is tasty, eh?',
    'Stuffing the data... 🍞',
    'Warm and cozy loading... 🧣',
    'Harvest moon rising... 🌕',
    'Gratitude loading... 💛',
    'Canadian warmth... 🇨🇦',
    'Feast is preparing... 🍽️',
    'Apple cider warming... 🍎',
    'Leaves are crunching... 🍂',
    'Sweater weather loading... 🧶',
    'True north thankful... 🍁',
    'Merci beaucoup... 💛',
  ],
};

/**
 * Independence Day theme (June 28 - July 4) - US
 */
export const INDEPENDENCE_DAY_US_THEME: LoadingTheme = {
  id: 'independence-day-us',
  name: 'Independence Day (US)',
  startsAt: { month: 6, day: 28 },
  endsAt: { month: 7, day: 4 },
  locales: ['en-US'],
  // Fireworks-like spin, then celebratory pulse-spin
  animations: [
    { type: 'spin', durationMs: 3000 },
    { type: 'pulse-spin', durationMs: 3000 },
    { type: 'pulse' }
  ],
  colors: [
    '#B22234', // Old Glory Red
    '#FFFFFF', // White
    '#3C3B6E', // Old Glory Blue
  ],
  gradients: [
    { startColor: '#B22234', endColor: '#3C3B6E', angle: 0 }, // Red to Blue
    { startColor: '#3C3B6E', endColor: '#B22234', angle: 0 }, // Blue to Red
    { startColor: '#B22234', endColor: '#FFFFFF', angle: 0 }, // Red to White
    { startColor: '#FFFFFF', endColor: '#3C3B6E', angle: 0 }, // White to Blue
  ],
  messages: [
    'Loading workspace...',
    'Happy 4th of July! 🎆',
    'Land of the free loading... 🗽',
    'Fireworks incoming... 🎇',
    'Stars and stripes forever... ⭐',
    'Liberty is loading... 🔔',
    'Red, white, and blue... 🇺🇸',
    'Freedom rings... 🔔',
    'Patriotic preparations... 🦅',
    'Sparklers are lit... ✨',
    'BBQ is firing up... 🍔',
    'Celebrating independence... 🎉',
    'America the beautiful... 🏔️',
    'Rockets red glare... 🚀',
    'Bombs bursting in air... 🎆',
    'United we load... 🤝',
    'Liberty and justice... ⚖️',
    'Star-spangled loading... ⭐',
    'Freedom is loading... 🗽',
    'Parade is starting... 🎺',
    'Hot dogs are grilling... 🌭',
    'Flags are waving... 🇺🇸',
    'Independence loading... 📜',
    'Sweet land of liberty... 🎶',
    'Let freedom ring... 🔔',
  ],
};

/**
 * Canada Day theme (June 28 - July 1) - Canada
 */
export const CANADA_DAY_THEME: LoadingTheme = {
  id: 'canada-day',
  name: 'Canada Day',
  startsAt: { month: 6, day: 28 },
  endsAt: { month: 7, day: 1 },
  locales: ['en-CA', 'fr-CA'],
  // Celebratory bounce, then pulse
  animations: [
    { type: 'bounce', durationMs: 4000 },
    { type: 'pulse' }
  ],
  colors: [
    '#FF0000', // Red
    '#FFFFFF', // White
  ],
  gradients: [
    { startColor: '#FF0000', endColor: '#FFFFFF', angle: 0 }, // Red to White
    { startColor: '#FFFFFF', endColor: '#FF0000', angle: 0 }, // White to Red
  ],
  messages: [
    'Loading workspace...',
    'Happy Canada Day! 🇨🇦',
    'Bonne fête du Canada! 🍁',
    'True north strong and free... 🏔️',
    'Celebrating Canada, eh... 🎉',
    'Maple leaf loading... 🍁',
    'Red and white pride... ❤️',
    'From coast to coast... 🌊',
    'O Canada loading... 🎶',
    'Northern lights glowing... 🌌',
    'Poutine is ready... 🍟',
    'Hockey night loading... 🏒',
    'Canadian spirit rising... 🇨🇦',
    'Fireworks over Parliament... 🎆',
    'Celebrating since 1867... 🎂',
    'Mounties are ready... 🐴',
    'Canadian pride loading... 💛',
    'Land of the maple... 🍁',
    'Strong and free... 💪',
    'Celebrating together... 🤝',
    'Northern beauty loading... 🏔️',
    'Canadian hearts united... ❤️',
    'Beaver approved... 🦫',
    'Sorry for the wait, eh... 😊',
    'True patriot love... 🇨🇦',
  ],
};

/**
 * Mexican Independence Day theme (September 13-16) - Mexico
 */
export const INDEPENDENCE_DAY_MX_THEME: LoadingTheme = {
  id: 'independence-day-mx',
  name: 'Mexican Independence Day',
  startsAt: { month: 9, day: 13 },
  endsAt: { month: 9, day: 16 },
  locales: ['es-MX', 'es'],
  priority: 5,
  // Fiesta spin, then celebratory pulse-spin
  animations: [
    { type: 'spin', durationMs: 3000 },
    { type: 'pulse-spin', durationMs: 3000 },
    { type: 'pulse' }
  ],
  colors: [
    '#006847', // Green
    '#FFFFFF', // White
    '#CE1126', // Red
  ],
  gradients: [
    { startColor: '#006847', endColor: '#CE1126', angle: 0 }, // Green to Red
    { startColor: '#CE1126', endColor: '#006847', angle: 0 }, // Red to Green
    { startColor: '#006847', endColor: '#FFFFFF', angle: 0 }, // Green to White
    { startColor: '#FFFFFF', endColor: '#CE1126', angle: 0 }, // White to Red
  ],
  messages: [
    'Cargando espacio de trabajo...',
    '¡Viva México! 🇲🇽',
    'Felices fiestas patrias... 🎉',
    'Verde, blanco y rojo... 💚',
    'Orgullo mexicano... 🦅',
    'Celebrando la independencia... 🎊',
    'Mariachi is playing... 🎺',
    'Fiesta mexicana... 🎉',
    'Tradiciones cargando... 🌮',
    'Cultura loading... 🎨',
    'Alegría mexicana... 😊',
    'Colores patrios... 🇲🇽',
    'Libertad cargando... ⭐',
    'Heroes remembered... 🏛️',
    'México lindo y querido... ❤️',
    'Corazón mexicano... 💚',
    'Fuegos artificiales... 🎆',
    'Celebración patria... 🎊',
    'Unidos por México... 🤝',
    'Orgullo nacional... 🦅',
    'Tradición y cultura... 🎭',
    'México en el corazón... ❤️',
    '¡Que viva México! 🇲🇽',
    'Patria querida... 💛',
  ],
};

/**
 * Indian Independence Day theme (August 13-15) - India
 */
export const INDEPENDENCE_DAY_IN_THEME: LoadingTheme = {
  id: 'independence-day-in',
  name: 'Indian Independence Day',
  startsAt: { month: 8, day: 13 },
  endsAt: { month: 8, day: 15 },
  locales: ['en-IN', 'hi', 'hi-IN'],
  // Patriotic spin, then pulse
  animations: [
    { type: 'spin', durationMs: 3000 },
    { type: 'pulse' }
  ],
  colors: [
    '#FF9933', // Saffron
    '#FFFFFF', // White
    '#138808', // Green
    '#000080', // Navy Blue (Ashoka Chakra)
  ],
  gradients: [
    { startColor: '#FF9933', endColor: '#138808', angle: 90 }, // Saffron to Green
    { startColor: '#138808', endColor: '#FF9933', angle: 90 }, // Green to Saffron
    { startColor: '#FF9933', endColor: '#FFFFFF', angle: 90 }, // Saffron to White
    { startColor: '#FFFFFF', endColor: '#138808', angle: 90 }, // White to Green
  ],
  messages: [
    'Loading workspace...',
    'Jai Hind! 🇮🇳',
    'Happy Independence Day! 🎉',
    'Celebrating freedom... 🕊️',
    'Tiranga is flying... 🇮🇳',
    'Unity in diversity... 🤝',
    'Saffron, white, and green... 🧡',
    'Mera Bharat Mahan... ✨',
    'Pride of India loading... 🦚',
    'Freedom fighters remembered... 🙏',
    'Vande Mataram... 🎶',
    'Indian spirit rising... 💪',
    'Patriotic vibes... 🇮🇳',
    'From Himalayas to oceans... 🏔️',
    'Incredible India loading... ✨',
    'Azadi ka Amrit... 🪔',
    'Bharat Mata ki Jai... 🙏',
    'Unity is strength... 💪',
    'Democratic dreams... ⭐',
    'Secular spirit loading... 🤝',
    'Rich heritage loading... 🏛️',
    'Cultural pride... 💃',
    'National anthem playing... 🎵',
    'Tricolor pride... 🧡',
    'India shining... ✨',
  ],
};

/**
 * Diwali theme (variable dates, roughly October-November) - India
 * Using a broad range since Diwali dates change yearly
 */
export const DIWALI_THEME: LoadingTheme = {
  id: 'diwali',
  name: 'Diwali',
  startsAt: { month: 10, day: 20 },
  endsAt: { month: 11, day: 15 },
  locales: ['en-IN', 'hi', 'hi-IN'],
  priority: 5,
  // Festival of lights - glowing pulse-spin, then warm pulse
  animations: [
    { type: 'pulse-spin', durationMs: 4000 },
    { type: 'pulse' }
  ],
  colors: [
    '#FFD700', // Gold
    '#FF6600', // Orange (diyas)
    '#8B0000', // Dark Red
    '#9400D3', // Dark Violet
    '#FF1493', // Deep Pink
  ],
  gradients: [
    { startColor: '#FFD700', endColor: '#FF6600', angle: 45 }, // Gold to Orange
    { startColor: '#FF6600', endColor: '#FFD700', angle: 45 }, // Orange to Gold
    { startColor: '#FFD700', endColor: '#8B0000', angle: 45 }, // Gold to Dark Red
    { startColor: '#8B0000', endColor: '#9400D3', angle: 45 }, // Red to Violet
    { startColor: '#9400D3', endColor: '#FF1493', angle: 45 }, // Violet to Pink
  ],
  messages: [
    'Loading workspace...',
    'Happy Diwali! 🪔',
    'Shubh Deepavali! ✨',
    'Festival of lights... 💡',
    'Diyas are glowing... 🪔',
    'Spreading brightness... ✨',
    'Lakshmi blessings... 🙏',
    'Rangoli loading... 🎨',
    'Sweet celebrations... 🍬',
    'Light over darkness... 💡',
    'Prosperity loading... 🪙',
    'Fireworks of joy... 🎆',
    'Golden blessings... ✨',
    'Festive vibes... 🎉',
    'Sweets are ready... 🍪',
    'Family gathering... 👨‍👩‍👧‍👦',
    'New beginnings... 🌟',
    'Divine blessings... 🙏',
    'Auspicious loading... ⭐',
    'Celebration mode... 🎊',
    'Sparklers glowing... ✨',
    'Joy and happiness... 😊',
    'Wealth and wisdom... 📚',
    'Radiant preparations... 💫',
    'Illuminating your day... 🪔',
  ],
};

/**
 * All available themes in priority order.
 * More specific themes (regional, higher priority) should come first.
 */
export const ALL_THEMES: LoadingTheme[] = [
  // Regional/specific themes (higher priority)
  NEW_YEAR_THEME,
  DIWALI_THEME,
  INDEPENDENCE_DAY_MX_THEME,
  INDEPENDENCE_DAY_IN_THEME,
  INDEPENDENCE_DAY_US_THEME,
  CANADA_DAY_THEME,
  THANKSGIVING_CA_THEME,
  THANKSGIVING_US_THEME,

  // Global themes
  HALLOWEEN_THEME,
  VALENTINES_THEME,
  ST_PATRICKS_THEME,
  SPRING_THEME,
  WINTER_HOLIDAY_THEME,

  // Default fallback (always matches)
  STANDARD_THEME,
];

/**
 * Get the user's browser locale.
 */
export function getBrowserLocale(): string {
  if (typeof navigator !== 'undefined') {
    return navigator.language || (navigator as { userLanguage?: string }).userLanguage || 'en';
  }
  return 'en';
}

/**
 * Check if a theme's date range includes today.
 * Handles ranges that span year boundaries (e.g., Dec 31 - Jan 2).
 */
function isDateInRange(
  today: { month: number; day: number },
  start: { month: number; day: number },
  end: { month: number; day: number }
): boolean {
  const todayValue = today.month * 100 + today.day;
  const startValue = start.month * 100 + start.day;
  const endValue = end.month * 100 + end.day;

  if (startValue <= endValue) {
    // Normal range (e.g., Mar 14 - Mar 17)
    return todayValue >= startValue && todayValue <= endValue;
  } else {
    // Range spans year boundary (e.g., Dec 31 - Jan 2)
    return todayValue >= startValue || todayValue <= endValue;
  }
}

/**
 * Check if a locale matches any of the theme's allowed locales.
 * Supports partial matching (e.g., 'en' matches 'en-US', 'en-GB').
 */
function localeMatches(userLocale: string, themeLocales?: string[]): boolean {
  if (!themeLocales || themeLocales.length === 0) {
    return true; // No locale restriction means global theme
  }

  const normalizedUserLocale = userLocale.toLowerCase();

  return themeLocales.some(themeLocale => {
    const normalizedThemeLocale = themeLocale.toLowerCase();
    // Exact match or prefix match
    return normalizedUserLocale === normalizedThemeLocale ||
           normalizedUserLocale.startsWith(normalizedThemeLocale + '-') ||
           normalizedThemeLocale.startsWith(normalizedUserLocale + '-');
  });
}

/**
 * Find the best matching theme for the current date and locale.
 * Returns the highest priority matching theme, or STANDARD_THEME if none match.
 */
export function getActiveTheme(date: Date = new Date(), locale?: string): LoadingTheme {
  const userLocale = locale || getBrowserLocale();
  const today = { month: date.getMonth() + 1, day: date.getDate() };

  // Find all matching themes
  const matchingThemes = ALL_THEMES.filter(theme => {
    const dateMatches = isDateInRange(today, theme.startsAt, theme.endsAt);
    const localeMatch = localeMatches(userLocale, theme.locales);
    return dateMatches && localeMatch;
  });

  if (matchingThemes.length === 0) {
    return STANDARD_THEME;
  }

  // Sort by priority (higher first) and return the best match
  matchingThemes.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // If the best match is STANDARD_THEME and there are other matches, prefer those
  if (matchingThemes[0].id === 'standard' && matchingThemes.length > 1) {
    return matchingThemes[1];
  }

  return matchingThemes[0];
}
