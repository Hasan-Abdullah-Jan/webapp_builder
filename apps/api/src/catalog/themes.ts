/** One-click theme presets (plan §6.3). Owners can fine-tune afterwards. */
export const THEME_PRESETS = [
  { key: 'fire', name: 'Fire', colors: { primary: '#E31837', secondary: '#FFC72C', background: '#FFFFFF', surface: '#FFF7F2', text: '#1A1A1A' } },
  { key: 'forest', name: 'Forest', colors: { primary: '#1F7A4D', secondary: '#F2C14E', background: '#FFFFFF', surface: '#F3F8F4', text: '#14211A' } },
  { key: 'ocean', name: 'Ocean', colors: { primary: '#0B6BCB', secondary: '#FF8A3D', background: '#FFFFFF', surface: '#F2F7FC', text: '#0F1B2B' } },
  { key: 'espresso', name: 'Espresso', colors: { primary: '#6F4E37', secondary: '#D9A441', background: '#FFFBF5', surface: '#F5ECE1', text: '#2B1D14' } },
  { key: 'midnight', name: 'Midnight', colors: { primary: '#F5B700', secondary: '#E4572E', background: '#111318', surface: '#1B1E26', text: '#F4F4F5' } },
  { key: 'blush', name: 'Blush', colors: { primary: '#C2185B', secondary: '#7B61FF', background: '#FFFFFF', surface: '#FCF2F6', text: '#231A1F' } },
];

/** Curated font pairs (plan §6.1: 6 choices, not 1,000). Loaded from Google Fonts by the storefront. */
export const FONT_PAIRS = [
  { key: 'poppins-inter', heading: 'Poppins', body: 'Inter' },
  { key: 'playfair-lato', heading: 'Playfair Display', body: 'Lato' },
  { key: 'montserrat-opensans', heading: 'Montserrat', body: 'Open Sans' },
  { key: 'oswald-roboto', heading: 'Oswald', body: 'Roboto' },
  { key: 'dmserif-dmsans', heading: 'DM Serif Display', body: 'DM Sans' },
  { key: 'nunito-nunito', heading: 'Nunito', body: 'Nunito' },
];

export const ALLOWED_FONTS = new Set(FONT_PAIRS.flatMap((f) => [f.heading, f.body]));

/** Section types the storefront can render (plan §6.2, v1 subset). */
export const SECTION_TYPES = [
  'heroBanner', 'categoryStrip', 'featuredProducts', 'menuGrid', 'about', 'branchList', 'richText', 'announcement',
] as const;
