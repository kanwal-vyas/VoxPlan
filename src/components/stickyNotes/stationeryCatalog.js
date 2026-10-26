/**
 * VoxPlan Illustrated Stationery Catalog
 *
 * Defines charming memo paper styles inspired by illustrated stationery:
 * delicate pastel borders, gingham & pattern frames, scattered character line art,
 * cute companion doodles, washi tape accents, and readable ink colors.
 * Zero external CDN or image dependencies; 100% offline, local SVG, and accessible.
 */

// Reusable SVG helper motifs for tabs & standalone icons
export const MOTIF_ICONS = {
  bunny: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stationery-svg-motif">
      <!-- Left Long Distinct Rabbit Ear -->
      <path d="M7.5 11C6 8 5.5 2 8 2C10.5 2 10.5 7.5 9.5 11" fill="#FFF" />
      <path d="M7.8 7.5C7.2 5.5 7.2 3.5 8 3.5C8.8 3.5 8.8 5.5 8.5 7.5" fill="#FFCCD5" stroke="none" />
      <!-- Right Long Distinct Rabbit Ear -->
      <path d="M14.5 11C13.5 7.5 13.5 2 16 2C18.5 2 18 8 16.5 11" fill="#FFF" />
      <path d="M15.5 7.5C15.2 5.5 15.2 3.5 16 3.5C16.8 3.5 16.8 5.5 16.2 7.5" fill="#FFCCD5" stroke="none" />
      <!-- Rounded Head & Soft Cheeks -->
      <path d="M5.5 15C5.5 11.5 8.2 10.5 12 10.5C15.8 10.5 18.5 11.5 18.5 15C18.5 19 15.8 21.5 12 21.5C8.2 21.5 5.5 19 5.5 15Z" fill="#FFF" />
      <!-- Expressive Eyes -->
      <circle cx="9.2" cy="14.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="14.5" r="1" fill="currentColor" stroke="none" />
      <!-- Blush Cheeks -->
      <ellipse cx="7.5" cy="16.5" rx="1.6" ry="1" fill="#FFAEC0" opacity="0.8" stroke="none" />
      <ellipse cx="16.5" cy="16.5" rx="1.6" ry="1" fill="#FFAEC0" opacity="0.8" stroke="none" />
      <!-- Nose & Mouth -->
      <ellipse cx="12" cy="15.8" rx="0.8" ry="0.6" fill="#D95C78" stroke="none" />
      <path d="M11 17C11.5 17.6 12 17.6 12 17C12 17.6 12.5 17.6 13 17" stroke-width="1.1" />
      <!-- Whiskers -->
      <line x1="5" y1="16" x2="7" y2="16.5" stroke-width="1" />
      <line x1="17" y1="16.5" x2="19" y2="16" stroke-width="1" />
    </svg>
  `,
  bearCamera: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stationery-svg-motif">
      <circle cx="6.5" cy="6.5" r="2.5" fill="#FFF" />
      <circle cx="6.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="6.5" r="2.5" fill="#FFF" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M5 14C5 10 8 8 12 8C16 8 19 10 19 14C19 18 16 20.5 12 20.5C8 20.5 5 18 5 14Z" fill="#FFF" />
      <circle cx="9" cy="13.2" r="1" fill="currentColor" stroke="none" />
      <path d="M14 13L15.5 13.6L14 14.2" stroke="currentColor" stroke-width="1.2" />
      <ellipse cx="7.5" cy="15" rx="1.5" ry="0.9" fill="#FFAEC0" opacity="0.75" stroke="none" />
      <ellipse cx="16.5" cy="15" rx="1.5" ry="0.9" fill="#FFAEC0" opacity="0.75" stroke="none" />
      <path d="M11.2 15.8C11.6 16.2 12.4 16.2 12.8 15.8" />
      <circle cx="12" cy="14.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  `,
  cat: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stationery-svg-motif">
      <path d="M6 7L7.5 11" fill="#FFF" />
      <path d="M18 7L16.5 11" fill="#FFF" />
      <path d="M6 7L10 9" />
      <path d="M18 7L14 9" />
      <path d="M5.5 14.5C5.5 11 8 9.5 12 9.5C16 9.5 18.5 11 18.5 14.5C18.5 18.5 15.5 20.5 12 20.5C8.5 20.5 5.5 18.5 5.5 14.5Z" fill="#FFF" />
      <path d="M7 6L8.5 9.5" stroke="currentColor" stroke-width="1" />
      <path d="M17 6L15.5 9.5" stroke="currentColor" stroke-width="1" />
      <circle cx="9.2" cy="14" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="14" r="0.9" fill="currentColor" stroke="none" />
      <line x1="5.5" y1="14" x2="7.8" y2="14.5" stroke-width="1.1" />
      <line x1="5.5" y1="16" x2="7.8" y2="15.8" stroke-width="1.1" />
      <line x1="18.5" y1="14" x2="16.2" y2="14.5" stroke-width="1.1" />
      <line x1="18.5" y1="16" x2="16.2" y2="15.8" stroke-width="1.1" />
      <ellipse cx="7.8" cy="15.5" rx="1.5" ry="0.9" fill="#FFAEC0" opacity="0.75" stroke="none" />
      <ellipse cx="16.2" cy="15.5" rx="1.5" ry="0.9" fill="#FFAEC0" opacity="0.75" stroke="none" />
      <path d="M11.5 15.6C11.8 16 12.2 16 12.5 15.6" />
      <circle cx="12" cy="14.8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  `,
  bearForest: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stationery-svg-motif">
      <circle cx="6.5" cy="7" r="2.5" fill="#FFF" />
      <circle cx="17.5" cy="7" r="2.5" fill="#FFF" />
      <circle cx="6.5" cy="7" r="1.2" fill="#F5EDE0" stroke="none" />
      <circle cx="17.5" cy="7" r="1.2" fill="#F5EDE0" stroke="none" />
      <ellipse cx="12" cy="14" rx="6.5" ry="6" fill="#FFF" />
      <circle cx="9.5" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="15.5" rx="2.2" ry="1.4" fill="#F5EDE0" />
      <circle cx="12" cy="15" r="0.6" fill="currentColor" stroke="none" />
      <path d="M11.5 16.2C11.8 16.5 12.2 16.5 12.5 16.2" stroke-width="1.1" />
      <ellipse cx="7.8" cy="14.8" rx="1.4" ry="0.9" fill="#FFAEC0" opacity="0.7" stroke="none" />
      <ellipse cx="16.2" cy="14.8" rx="1.4" ry="0.9" fill="#FFAEC0" opacity="0.7" stroke="none" />
    </svg>
  `,
  sakuraBlossom: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stationery-svg-motif">
      <!-- 5-Petal Cherry Blossom -->
      <circle cx="12" cy="12" r="3" fill="#FFCCD5" stroke="none" />
      <circle cx="12" cy="7" r="2.8" fill="#FFF3F5" />
      <circle cx="16.5" cy="10" r="2.8" fill="#FFF3F5" />
      <circle cx="15" cy="15.5" r="2.8" fill="#FFF3F5" />
      <circle cx="9" cy="15.5" r="2.8" fill="#FFF3F5" />
      <circle cx="7.5" cy="10" r="2.8" fill="#FFF3F5" />
      <circle cx="12" cy="12" r="1.2" fill="#C45732" stroke="none" />
    </svg>
  `,
  sakuraBird: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stationery-svg-motif">
      <!-- Projecting Golden Beak -->
      <polygon points="19,8 23,9.5 19,11" fill="#E88320" stroke="currentColor" stroke-width="1" />
      <!-- Round Head & Plump Body -->
      <path d="M6 16C5 13 6 8.5 11 6.5C14.5 5 18 6.5 19 9C19.5 11 18.5 14 15 16C12.5 17.5 9 18 7 17.5L3 19L5 16Z" fill="#FFF" />
      <!-- Eye -->
      <circle cx="15.5" cy="8.8" r="1" fill="currentColor" stroke="none" />
      <!-- Wing with Feather Contour -->
      <path d="M9 11.5C12 10.5 15.5 11.5 15 14.5C13.5 17 9.5 16.5 8 13.5Z" fill="#E8DED0" />
      <!-- Tiny Feet Gripping Perch -->
      <line x1="9" y1="18" x2="8.5" y2="21" stroke-width="1.3" />
      <line x1="12.5" y1="18" x2="12" y2="21" stroke-width="1.3" />
      <line x1="6" y1="21" x2="15" y2="21" stroke-width="1.2" />
    </svg>
  `,
  chickDaisy: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stationery-svg-motif">
      <ellipse cx="12" cy="14.5" rx="6.5" ry="6" fill="#FFFBE6" />
      <circle cx="9.2" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
      <path d="M11 15L12 16.5L13 15Z" fill="#E88320" stroke="none" />
      <ellipse cx="7.6" cy="15" rx="1.4" ry="0.9" fill="#FFAEC0" opacity="0.75" stroke="none" />
      <ellipse cx="16.4" cy="15" rx="1.4" ry="0.9" fill="#FFAEC0" opacity="0.75" stroke="none" />
      <!-- Daisy on head -->
      <circle cx="12" cy="6" r="1.3" fill="#E8A820" stroke="none" />
      <circle cx="12" cy="4" r="1.1" fill="#FFF" stroke="currentColor" stroke-width="0.8" />
      <circle cx="14" cy="5.2" r="1.1" fill="#FFF" stroke="currentColor" stroke-width="0.8" />
      <circle cx="13.2" cy="7.2" r="1.1" fill="#FFF" stroke="currentColor" stroke-width="0.8" />
      <circle cx="10.8" cy="7.2" r="1.1" fill="#FFF" stroke="currentColor" stroke-width="0.8" />
      <circle cx="10" cy="5.2" r="1.1" fill="#FFF" stroke="currentColor" stroke-width="0.8" />
    </svg>
  `,
  frogClover: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stationery-svg-motif">
      <circle cx="7.5" cy="8.5" r="2.8" fill="#E9F7E8" />
      <circle cx="16.5" cy="8.5" r="2.8" fill="#E9F7E8" />
      <circle cx="7.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="14" rx="7" ry="5.5" fill="#E9F7E8" />
      <path d="M9 14.5C10.5 16 13.5 16 15 14.5" stroke-width="1.2" />
      <ellipse cx="7.5" cy="14" rx="1.4" ry="0.9" fill="#FFAEC0" opacity="0.7" stroke="none" />
      <ellipse cx="16.5" cy="14" rx="1.4" ry="0.9" fill="#FFAEC0" opacity="0.7" stroke="none" />
    </svg>
  `,
};

export const STATIONERY_STYLES = [
  {
    id: 'powder-blue',
    name: 'Morning Sky Bear',
    ariaLabel: 'Morning sky blue grid stationery with fluffy camera bear, smiling stars, and playful doodles',
    description: 'Soft blue gingham grid with a selfie bear holding a camera, peeking bunny, and smiling stars',
    themeClass: 'theme-powder-blue',
    frameBg: '#E4F0FA',
    frameBorder: '#8BB4DB',
    borderPatternColor: '#7BA8D3',
    paperBg: '#F3F8FC',
    paperBorder: '#B4D2EE',
    inputBorder: 'rgba(42, 78, 120, 0.28)',
    paperShadow: '0 6px 18px rgba(35, 78, 120, 0.10), 0 2px 6px rgba(35, 78, 120, 0.05)',
    tabBg: '#D6E8F7',
    tabBorder: '#A9CBE8',
    tabText: '#1C4263',
    accentColor: '#2B6EA8',
    lineArtColor: '#2A4E78',
    textColor: '#1E3247',
    titleColor: '#122336',
    mutedColor: '#53708D',
    tapeColor: 'rgba(196, 222, 246, 0.85)',
    patternType: 'grid-blue',
    handwritingFont: "'Sue Ellen Francisco', cursive",
    handwritingName: 'Sue Ellen Francisco',
    motifType: 'bearCamera',
    motifSvg: MOTIF_ICONS.bearCamera,
    // Scattered illustrations: Top edge banner + Bottom corner artwork
    topDecorSvg: `
      <svg viewBox="0 0 400 65" fill="none" class="stationery-scattered-top" preserveAspectRatio="none">
        <!-- Puffy 5-point Star Left -->
        <g transform="translate(45, 12)" stroke="#2A4E78" stroke-width="1.8" fill="#FFF">
          <path d="M12 2L15 8.5L22 9.5L17 14.5L18.5 21.5L12 18L5.5 21.5L7 14.5L2 9.5L9 8.5Z" stroke-linejoin="round" />
          <circle cx="9.5" cy="12" r="0.8" fill="#2A4E78" stroke="none" />
          <circle cx="14.5" cy="12" r="0.8" fill="#2A4E78" stroke="none" />
        </g>
        <!-- Bunny Head Center -->
        <g transform="translate(140, 4)" stroke="#2A4E78" stroke-width="1.8">
          <path d="M12 1.5C10 1.5 8.5 5 10 9L11.5 12.5" fill="#FFF" />
          <path d="M22 1.5C24 1.5 25.5 5 24 9L22.5 12.5" fill="#FFF" />
          <ellipse cx="17" cy="17" rx="10" ry="8" fill="#FFF" />
          <circle cx="13.5" cy="16.5" r="1.1" fill="#2A4E78" stroke="none" />
          <circle cx="20.5" cy="16.5" r="1.1" fill="#2A4E78" stroke="none" />
          <ellipse cx="11.5" cy="18.5" rx="2" ry="1.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <ellipse cx="22.5" cy="18.5" rx="2" ry="1.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <path d="M16 18.5C16.5 19 17.5 19 18 18.5" stroke-linecap="round" />
        </g>
        <!-- Puffy 5-point Star Mid-Right -->
        <g transform="translate(235, 12)" stroke="#2A4E78" stroke-width="1.8" fill="#FFF">
          <path d="M12 2L15 8.5L22 9.5L17 14.5L18.5 21.5L12 18L5.5 21.5L7 14.5L2 9.5L9 8.5Z" stroke-linejoin="round" />
        </g>
        <!-- Smiling Bear Head Right -->
        <g transform="translate(320, 6)" stroke="#2A4E78" stroke-width="1.8">
          <circle cx="8" cy="7" r="3.8" fill="#FFF" />
          <circle cx="8" cy="7" r="1.8" fill="#2A4E78" stroke="none" />
          <circle cx="26" cy="7" r="3.8" fill="#FFF" />
          <circle cx="26" cy="7" r="1.8" fill="#2A4E78" stroke="none" />
          <ellipse cx="17" cy="17" rx="12" ry="10" fill="#FFF" />
          <circle cx="12.5" cy="16" r="1.2" fill="#2A4E78" stroke="none" />
          <circle cx="21.5" cy="16" r="1.2" fill="#2A4E78" stroke="none" />
          <ellipse cx="10" cy="18" rx="2.2" ry="1.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <ellipse cx="24" cy="18" rx="2.2" ry="1.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <circle cx="17" cy="17.5" r="0.9" fill="#2A4E78" stroke="none" />
          <path d="M15.5 19C16.2 20 17.8 20 18.5 19" stroke-linecap="round" />
        </g>
      </svg>
    `,
    bottomDecorSvg: `
      <svg viewBox="0 0 400 120" fill="none" class="stationery-scattered-bottom" preserveAspectRatio="none">
        <!-- Main Fluffy Bear Holding Camera / Smartphone (Bottom-Left) -->
        <g transform="translate(8, 6)" stroke="#2A4E78" stroke-width="2">
          <!-- Bear Head & Ears -->
          <circle cx="24" cy="22" r="7.5" fill="#FFF" />
          <circle cx="24" cy="22" r="3.8" fill="#2A4E78" stroke="none" />
          <circle cx="64" cy="22" r="7.5" fill="#FFF" />
          <circle cx="64" cy="22" r="3.8" fill="#2A4E78" stroke="none" />
          <!-- Cloud Fluffy Body Contour -->
          <path d="M16 46C11 40 10 32 18 26C22 18 32 16 44 16C56 16 66 18 70 26C78 32 77 40 72 46C79 55 77 68 70 76C75 88 66 102 52 104C40 105 30 102 24 96C15 98 8 86 14 74C8 66 10 54 16 46Z" fill="#FFF" />
          <!-- Eyes: Winking Bear -->
          <circle cx="34" cy="40" r="2.2" fill="#2A4E78" stroke="none" />
          <path d="M50 38L55 42L50 44" stroke="#2A4E78" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          <!-- Cheeks -->
          <ellipse cx="28" cy="46" rx="4.5" ry="2.6" fill="#FFAEC0" opacity="0.85" stroke="none" />
          <ellipse cx="58" cy="46" rx="4.5" ry="2.6" fill="#FFAEC0" opacity="0.85" stroke="none" />
          <!-- Nose & Smile -->
          <ellipse cx="43" cy="44" rx="2" ry="1.5" fill="#2A4E78" stroke="none" />
          <path d="M39 48C41.5 51 44.5 51 47 48" stroke-linecap="round" />
          <!-- Paws Holding Phone -->
          <path d="M22 68C22 60 30 58 35 64L32 74C28 76 22 74 22 68Z" fill="#FFF" />
          <!-- Smartphone / Camera -->
          <rect x="44" y="52" width="26" height="38" rx="5" fill="#FFF" stroke="#2A4E78" stroke-width="2" transform="rotate(-8 44 52)" />
          <circle cx="56" cy="62" r="3.5" fill="#E1EDF8" stroke="#2A4E78" stroke-width="1.4" />
          <circle cx="56" cy="62" r="1.4" fill="#2A4E78" stroke="none" />
          <circle cx="56" cy="72" r="1.5" fill="#2A4E78" stroke="none" />
          <!-- Right Paw Holding Edge -->
          <path d="M60 76C64 74 70 78 70 84C70 88 64 90 58 86Z" fill="#FFF" />
        </g>
        <!-- Floating Doodle Heart with Swoosh -->
        <g transform="translate(108, 48)" stroke="#2A4E78" stroke-width="2">
          <path d="M2 18C10 20 16 16 19 8" stroke-linecap="round" stroke-dasharray="1 1" />
          <path d="M20 8C19 3 24 1 26 5C28 1 33 3 32 8C30 13 26 15 26 15C26 15 22 13 20 8Z" fill="#FFAEC0" />
        </g>
        <!-- Playful Hand-lettering: yeah! happy every day -->
        <text x="135" y="82" fill="#2A4E78" font-size="16" font-family="'Comic Sans MS', 'Outfit', cursive, sans-serif" font-weight="bold" letter-spacing="0.5">yeah!</text>
        <text x="135" y="98" fill="#53708D" font-size="11" font-family="'Outfit', system-ui, sans-serif" font-weight="600" letter-spacing="0.4">happy every day</text>
        <!-- Cute Corner Stars / Sparkles (Bottom-Right) -->
        <g transform="translate(345, 75)" stroke="#2A4E78" stroke-width="1.6" fill="#FFF">
          <path d="M10 2L12 8L18 10L12 12L10 18L8 12L2 10L8 8Z" />
        </g>
        <circle cx="375" cy="95" r="2" fill="#2A4E78" stroke="none" />
      </svg>
    `,
  },
  {
    id: 'blush-bunny',
    name: 'Sakura Blush Bunny',
    ariaLabel: 'Soft pink gingham stationery with cute bunny holding a ripe strawberry, floating petals, and sweet hearts',
    description: 'Blush pink gingham frame with a charming upright-ear bunny holding a strawberry, blossoms, and hearts',
    themeClass: 'theme-blush-bunny',
    frameBg: '#FDECEF',
    frameBorder: '#EDA2B2',
    borderPatternColor: '#E58CA0',
    paperBg: '#FFF4F6',
    paperBorder: '#F3C2CD',
    inputBorder: 'rgba(92, 40, 54, 0.28)',
    paperShadow: '0 6px 18px rgba(184, 86, 108, 0.10), 0 2px 6px rgba(184, 86, 108, 0.05)',
    tabBg: '#F8D8E0',
    tabBorder: '#EDB6C4',
    tabText: '#5A2633',
    accentColor: '#D95C78',
    lineArtColor: '#5C2836',
    textColor: '#3C2129',
    titleColor: '#261218',
    mutedColor: '#8C5A68',
    tapeColor: 'rgba(250, 212, 222, 0.85)',
    patternType: 'grid-pink',
    handwritingFont: "'La Belle Aurore', cursive",
    handwritingName: 'La Belle Aurore',
    motifType: 'bunny',
    motifSvg: MOTIF_ICONS.bunny,
    topDecorSvg: `
      <svg viewBox="0 0 400 65" fill="none" class="stationery-scattered-top" preserveAspectRatio="none">
        <!-- Blossom Left -->
        <g transform="translate(40, 14)" stroke="#5C2836" stroke-width="1.6" fill="#FFF0F3">
          <circle cx="10" cy="10" r="4.5" fill="#FFCCD5" stroke="none" />
          <circle cx="10" cy="4" r="3" />
          <circle cx="16" cy="7" r="3" />
          <circle cx="16" cy="13" r="3" />
          <circle cx="10" cy="16" r="3" />
          <circle cx="4" cy="13" r="3" />
          <circle cx="4" cy="7" r="3" />
          <circle cx="10" cy="10" r="1.5" fill="#5C2836" stroke="none" />
        </g>
        <!-- Bunny Peeking Center -->
        <g transform="translate(160, 2)" stroke="#5C2836" stroke-width="1.8">
          <!-- Left Long Upright Rabbit Ear -->
          <path d="M9 22C6 16 5 2 9 2C13 2 13 15 12 22" fill="#FFF" />
          <path d="M8.8 15C7.8 11 7.5 4.5 9 4.5C10.5 4.5 10.8 11 10.2 15" fill="#FFCCD5" stroke="none" />
          <!-- Right Long Upright Rabbit Ear -->
          <path d="M19 22C18 15 18 2 22 2C26 2 25 16 22 22" fill="#FFF" />
          <path d="M20.8 15C20.2 11 20.5 4.5 22 4.5C23.5 4.5 23.2 11 22.2 15" fill="#FFCCD5" stroke="none" />
          <!-- Head & Soft Cheeks -->
          <path d="M4 27C4 22 8 20 15.5 20C23 20 27 22 27 27C27 32 23 34 15.5 34C8 34 4 32 4 27Z" fill="#FFF" />
          <!-- Eyes with Sparkle -->
          <circle cx="11.5" cy="25.5" r="1.3" fill="#5C2836" stroke="none" />
          <circle cx="11" cy="25" r="0.4" fill="#FFF" stroke="none" />
          <circle cx="19.5" cy="25.5" r="1.3" fill="#5C2836" stroke="none" />
          <circle cx="19" cy="25" r="0.4" fill="#FFF" stroke="none" />
          <!-- Rosy Cheeks -->
          <ellipse cx="8" cy="28" rx="2.5" ry="1.4" fill="#FFAEC0" opacity="0.85" stroke="none" />
          <ellipse cx="23" cy="28" rx="2.5" ry="1.4" fill="#FFAEC0" opacity="0.85" stroke="none" />
          <!-- Tiny Nose & Mouth -->
          <ellipse cx="15.5" cy="27.2" rx="1" ry="0.7" fill="#D95C78" stroke="none" />
          <path d="M14.2 28.6C14.8 29.4 15.5 29.4 15.5 28.8C15.5 29.4 16.2 29.4 16.8 28.6" stroke-linecap="round" stroke-width="1.2" />
          <!-- Whiskers -->
          <line x1="5" y1="27" x2="8" y2="28" stroke-width="1.2" />
          <line x1="23" y1="28" x2="26" y2="27" stroke-width="1.2" />
          <!-- Cute paws resting on frame -->
          <ellipse cx="10" cy="34" rx="3" ry="2" fill="#FFF" />
          <ellipse cx="21" cy="34" rx="3" ry="2" fill="#FFF" />
        </g>
        <!-- Blossom Right -->
        <g transform="translate(290, 14)" stroke="#5C2836" stroke-width="1.6" fill="#FFF0F3">
          <circle cx="10" cy="10" r="4.5" fill="#FFCCD5" stroke="none" />
          <circle cx="10" cy="4" r="3" />
          <circle cx="16" cy="7" r="3" />
          <circle cx="16" cy="13" r="3" />
          <circle cx="10" cy="16" r="3" />
          <circle cx="4" cy="13" r="3" />
          <circle cx="4" cy="7" r="3" />
          <circle cx="10" cy="10" r="1.5" fill="#5C2836" stroke="none" />
        </g>
        <!-- Little Floating Heart -->
        <path d="M355 18C353 14 357 12 359 15C361 12 365 14 363 18C361 22 359 24 359 24C359 24 357 22 355 18Z" fill="#FFAEC0" stroke="#5C2836" stroke-width="1.2" />
      </svg>
    `,
    bottomDecorSvg: `
      <svg viewBox="0 0 400 120" fill="none" class="stationery-scattered-bottom" preserveAspectRatio="none">
        <!-- Main Charming Bunny with Strawberry (Bottom-Left) -->
        <g transform="translate(10, 4)" stroke="#5C2836" stroke-width="2">
          <!-- Left Long Upright Rabbit Ear - Complete Closed Path -->
          <path d="M18 38 C14 26 14 8 20 2 C24 2 27 6 28 36 Z" fill="#FFF" />
          <path d="M20 34 C17 25 17 11 20.5 6 C23.5 6 24.5 11 25 34 Z" fill="#FFCCD5" stroke="#D95C78" stroke-width="1.6" />
          <!-- Right Long Upright Rabbit Ear - Complete Closed Path -->
          <path d="M38 36 C39 6 42 2 46 2 C52 8 52 26 48 38 Z" fill="#FFF" />
          <path d="M41 34 C41.5 11 42.5 6 45.5 6 C49 11 49 25 46 34 Z" fill="#FFCCD5" stroke="#D95C78" stroke-width="1.6" />
          <!-- Rounded Head & Soft Cheeks -->
          <ellipse cx="33" cy="50" rx="20" ry="16" fill="#FFF" />
          <!-- Compact Bunny Body -->
          <ellipse cx="33" cy="78" rx="22" ry="20" fill="#FFF" />
          <!-- Expressive Eyes with Highlights -->
          <circle cx="26" cy="48" r="2.2" fill="#5C2836" stroke="none" />
          <circle cx="25" cy="47" r="0.8" fill="#FFF" stroke="none" />
          <circle cx="40" cy="48" r="2.2" fill="#5C2836" stroke="none" />
          <circle cx="39" cy="47" r="0.8" fill="#FFF" stroke="none" />
          <!-- Rosy Cheeks -->
          <ellipse cx="20" cy="53" rx="4.8" ry="2.8" fill="#FFAEC0" opacity="0.85" stroke="none" />
          <ellipse cx="46" cy="53" rx="4.8" ry="2.8" fill="#FFAEC0" opacity="0.85" stroke="none" />
          <!-- Small Triangular Nose & Mouth -->
          <polygon points="33,51 31,49 35,49" fill="#D95C78" stroke="none" />
          <path d="M30.5 53.5C31.8 55.5 33 55.5 33 54C33 55.5 34.2 55.5 35.5 53.5" stroke-linecap="round" stroke-width="1.5" />
          <!-- Whiskers -->
          <line x1="14" y1="52" x2="20" y2="53" stroke-width="1.4" stroke-linecap="round" />
          <line x1="14" y1="55" x2="20" y2="55" stroke-width="1.4" stroke-linecap="round" />
          <line x1="46" y1="53" x2="52" y2="52" stroke-width="1.4" stroke-linecap="round" />
          <line x1="46" y1="55" x2="52" y2="55" stroke-width="1.4" stroke-linecap="round" />
          <!-- Visually Distinct Strawberry & Paws -->
          <g transform="translate(38, 64)">
            <!-- Strawberry Body -->
            <path d="M8 4C3 4 1 10 3 16C5 23 12 29 14 29C16 29 23 23 25 16C27 10 25 4 20 4Z" fill="#E84A68" stroke="#5C2836" stroke-width="1.8" />
            <!-- Yellow / White Seeds -->
            <circle cx="8" cy="10" r="0.9" fill="#FFF" stroke="none" />
            <circle cx="14" cy="11" r="0.9" fill="#FFF" stroke="none" />
            <circle cx="20" cy="10" r="0.9" fill="#FFF" stroke="none" />
            <circle cx="10" cy="17" r="0.9" fill="#FFF" stroke="none" />
            <circle cx="18" cy="17" r="0.9" fill="#FFF" stroke="none" />
            <circle cx="14" cy="23" r="0.9" fill="#FFF" stroke="none" />
            <!-- Green Strawberry Calyx Leaves -->
            <path d="M14 4L7 0L10 5L14 1L18 5L21 0Z" fill="#78B868" stroke="#5C2836" stroke-width="1.4" />
          </g>
          <!-- Distinct White Paws Hugging Strawberry -->
          <ellipse cx="38" cy="72" rx="4.5" ry="3.5" fill="#FFF" stroke="#5C2836" stroke-width="1.8" />
          <ellipse cx="58" cy="74" rx="4.5" ry="3.5" fill="#FFF" stroke="#5C2836" stroke-width="1.8" />
        </g>
        <!-- Floating Heart with Text -->
        <g transform="translate(108, 62)" stroke="#5C2836" stroke-width="1.6">
          <path d="M6 14C4 9 9 7 11 11C13 7 18 9 16 14C14 18 11 20 11 20C11 20 8 18 6 14Z" fill="#FFAEC0" />
        </g>
        <text x="132" y="80" fill="#5C2836" font-size="15" font-family="'Comic Sans MS', 'Outfit', cursive, sans-serif" font-weight="bold">sweet moments</text>
        <text x="132" y="96" fill="#8C5A68" font-size="11" font-family="'Outfit', system-ui, sans-serif" font-weight="600">cherish today</text>
        <!-- Strawberry in Bottom-Right Corner -->
        <g transform="translate(345, 68)" stroke="#5C2836" stroke-width="1.6">
          <path d="M12 4C7 4 4 10 6 16C8 22 14 28 16 28C18 28 24 22 26 16C28 10 25 4 20 4Z" fill="#FFAEC0" />
          <path d="M16 4L11 0L13 5L16 2L19 5L21 0Z" fill="#78B868" stroke="#5C2836" stroke-width="1.2" />
        </g>
      </svg>
    `,
  },
  {
    id: 'lavender-cat',
    name: 'Wisteria Lavender Cat',
    ariaLabel: 'Muted wisteria purple stationery with sweet sleeping kitten, crescent moon, and dreamy stars',
    description: 'Lavender pastel frame with a cozy curled kitten, teacup, crescent moon, and twinkling stars',
    themeClass: 'theme-lavender-cat',
    frameBg: '#F3ECF9',
    frameBorder: '#C9B4E6',
    borderPatternColor: '#B89DDC',
    paperBg: '#FAF5FD',
    paperBorder: '#DECFF2',
    inputBorder: 'rgba(66, 39, 88, 0.28)',
    paperShadow: '0 6px 18px rgba(98, 72, 142, 0.10), 0 2px 6px rgba(98, 72, 142, 0.05)',
    tabBg: '#E6DCF5',
    tabBorder: '#CAB9E6',
    tabText: '#3B2358',
    accentColor: '#8C5BAE',
    lineArtColor: '#422758',
    textColor: '#2E1E3B',
    titleColor: '#1E1228',
    mutedColor: '#755F88',
    tapeColor: 'rgba(230, 218, 246, 0.85)',
    patternType: 'stars-lavender',
    handwritingFont: "'Ephesis', cursive",
    handwritingName: 'Ephesis',
    motifType: 'cat',
    motifSvg: MOTIF_ICONS.cat,
    topDecorSvg: `
      <svg viewBox="0 0 400 65" fill="none" class="stationery-scattered-top" preserveAspectRatio="none">
        <!-- Crescent Moon Left -->
        <g transform="translate(42, 10)" stroke="#422758" stroke-width="1.6" fill="#F8EAFE">
          <path d="M14 2C7 5 6 15 11 22C16 28 25 28 29 23C22 25 15 19 15 12C15 8 17 5 19 3C17 2 15 2 14 2Z" />
        </g>
        <!-- Sparkle Stars -->
        <g transform="translate(85, 22)" stroke="#422758" stroke-width="1.4" fill="#FFF">
          <path d="M6 0L8 4L12 6L8 8L6 12L4 8L0 6L4 4Z" />
        </g>
        <!-- Cat Peeking Over Edge in Top-Center -->
        <g transform="translate(170, 4)" stroke="#422758" stroke-width="1.8">
          <path d="M4 14L8 4L13 10" fill="#FFF" />
          <path d="M28 14L24 4L19 10" fill="#FFF" />
          <ellipse cx="16" cy="18" rx="13" ry="9" fill="#FFF" />
          <!-- Curved Happy Eyes -->
          <path d="M10 17C11.5 15.5 13.5 15.5 15 17" stroke-linecap="round" />
          <path d="M17 17C18.5 15.5 20.5 15.5 22 17" stroke-linecap="round" />
          <ellipse cx="9" cy="20" rx="2" ry="1.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <ellipse cx="23" cy="20" rx="2" ry="1.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <line x1="4" y1="18" x2="8" y2="18.5" stroke-width="1.2" />
          <line x1="28" y1="18" x2="24" y2="18.5" stroke-width="1.2" />
        </g>
        <!-- Wisteria Sprig Right -->
        <g transform="translate(310, 10)" stroke="#422758" stroke-width="1.4" fill="#E6DCF5">
          <circle cx="10" cy="8" r="3" />
          <circle cx="16" cy="12" r="3" />
          <circle cx="12" cy="18" r="2.8" />
          <circle cx="18" cy="22" r="2.5" />
          <path d="M6 4C10 8 14 16 16 26" stroke="#8C5BAE" stroke-width="1.2" fill="none" />
        </g>
      </svg>
    `,
    bottomDecorSvg: `
      <svg viewBox="0 0 400 120" fill="none" class="stationery-scattered-bottom" preserveAspectRatio="none">
        <!-- Cute Sleeping Kitten Curled in Corner (Bottom-Right) -->
        <g transform="translate(285, 12)" stroke="#422758" stroke-width="2">
          <!-- Pointed Cat Ears -->
          <path d="M42 20L49 6L59 18" fill="#FFF" />
          <path d="M65 20L73 6L78 20" fill="#FFF" />
          <path d="M48 16L51 9L55 16" fill="#F8EAFE" stroke="#8C5BAE" stroke-width="1.2" />
          <path d="M68 16L72 9L75 16" fill="#F8EAFE" stroke="#8C5BAE" stroke-width="1.2" />
          <!-- Curled Oval Body -->
          <ellipse cx="55" cy="56" rx="36" ry="28" fill="#FFF" />
          <!-- Head -->
          <ellipse cx="58" cy="32" rx="22" ry="18" fill="#FFF" />
          <!-- Curved Sleeping Happy Eyes -->
          <path d="M46 32C49 35 53 35 56 32" stroke-linecap="round" />
          <path d="M64 32C67 35 71 35 74 32" stroke-linecap="round" />
          <!-- Nose & Whiskers -->
          <polygon points="60,36 57,39 63,39" fill="#FFAEC0" stroke="none" />
          <line x1="38" y1="36" x2="48" y2="38" stroke-width="1.3" stroke-linecap="round" />
          <line x1="38" y1="41" x2="48" y2="41" stroke-width="1.3" stroke-linecap="round" />
          <line x1="72" y1="38" x2="82" y2="36" stroke-width="1.3" stroke-linecap="round" />
          <line x1="72" y1="41" x2="82" y2="41" stroke-width="1.3" stroke-linecap="round" />
          <!-- Rosy Cheeks -->
          <ellipse cx="44" cy="38" rx="4" ry="2.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <ellipse cx="76" cy="38" rx="4" ry="2.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <!-- Curled Tail -->
          <path d="M22 64C12 56 16 38 28 36" stroke-linecap="round" stroke-width="5" />
          <path d="M22 64C12 56 16 38 28 36" stroke-linecap="round" stroke-width="2" stroke="#422758" />
        </g>
        <!-- Little Teacup with Heart Steam (Bottom-Left) -->
        <g transform="translate(18, 56)" stroke="#422758" stroke-width="1.8">
          <path d="M6 14C6 24 14 28 22 28C30 28 38 24 38 14Z" fill="#FFF" />
          <path d="M38 16C44 16 46 22 40 24" />
          <!-- Steam Heart -->
          <path d="M18 6C16 3 20 1 22 4C24 1 28 3 26 6C24 9 22 11 22 11C22 11 20 9 18 6Z" fill="#FFAEC0" stroke="#422758" stroke-width="1.2" />
        </g>
        <text x="72" y="78" fill="#422758" font-size="15" font-family="'Comic Sans MS', 'Outfit', cursive, sans-serif" font-weight="bold">stay cozy & soft</text>
        <text x="72" y="94" fill="#755F88" font-size="11" font-family="'Outfit', system-ui, sans-serif" font-weight="600">take your quiet time</text>
      </svg>
    `,
  },
  {
    id: 'mint-bear',
    name: 'Almond Forest Bear',
    ariaLabel: 'Warm almond washi stationery with friendly woodland bear, clover leaves, and tiny honey pot',
    description: 'Almond washi frame with a friendly woodland bear, clover leaves, and cheerful musical notes',
    themeClass: 'theme-mint-bear',
    frameBg: '#F7F1E6',
    frameBorder: '#D5C3A8',
    borderPatternColor: '#BAA384',
    paperBg: '#FAF6EE',
    paperBorder: '#E2D5C0',
    inputBorder: 'rgba(74, 56, 40, 0.28)',
    paperShadow: '0 6px 18px rgba(78, 60, 42, 0.09), 0 2px 6px rgba(78, 60, 42, 0.05)',
    tabBg: '#EBE1D0',
    tabBorder: '#D4C2A7',
    tabText: '#4A3A2C',
    accentColor: '#B86834',
    lineArtColor: '#4A3828',
    textColor: '#2E2218',
    titleColor: '#1F150D',
    mutedColor: '#7A6B5C',
    tapeColor: 'rgba(238, 230, 218, 0.88)',
    patternType: 'grid-mint',
    handwritingFont: "'Indie Flower', cursive",
    handwritingName: 'Indie Flower',
    motifType: 'bearForest',
    motifSvg: MOTIF_ICONS.bearForest,
    topDecorSvg: `
      <svg viewBox="0 0 400 65" fill="none" class="stationery-scattered-top" preserveAspectRatio="none">
        <!-- Sprouting Clover Left -->
        <g transform="translate(45, 12)" stroke="#4A3828" stroke-width="1.6" fill="#F5EDE0">
          <circle cx="8" cy="8" r="4.5" />
          <circle cx="16" cy="8" r="4.5" />
          <circle cx="12" cy="14" r="4.5" />
          <path d="M12 14C12 20 10 24 6 26" stroke="#4A3828" stroke-width="1.4" fill="none" />
        </g>
        <!-- Cute Fluffy Cloud Center -->
        <g transform="translate(165, 8)" stroke="#4A3828" stroke-width="1.6" fill="#FFF">
          <path d="M10 24C6 24 2 20 4 15C2 10 7 6 12 7C14 2 22 2 25 6C30 5 34 9 33 14C37 16 37 22 32 24Z" />
        </g>
        <!-- Sleeping Bear Face Right -->
        <g transform="translate(315, 8)" stroke="#4A3828" stroke-width="1.8">
          <circle cx="8" cy="7" r="3.5" fill="#FFF" />
          <circle cx="26" cy="7" r="3.5" fill="#FFF" />
          <ellipse cx="17" cy="17" rx="12" ry="10" fill="#FFF" />
          <path d="M11 16C12.5 17.5 14.5 17.5 16 16" stroke-linecap="round" />
          <path d="M18 16C19.5 17.5 21.5 17.5 23 16" stroke-linecap="round" />
          <ellipse cx="10" cy="18" rx="2" ry="1.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <ellipse cx="24" cy="18" rx="2" ry="1.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
        </g>
      </svg>
    `,
    bottomDecorSvg: `
      <svg viewBox="0 0 400 120" fill="none" class="stationery-scattered-bottom" preserveAspectRatio="none">
        <!-- Friendly Woodland Bear (Bottom-Left) -->
        <g transform="translate(12, 6)" stroke="#4A3828" stroke-width="2">
          <!-- Ears -->
          <circle cx="24" cy="18" r="7" fill="#FFF" />
          <circle cx="24" cy="18" r="3.2" fill="#F5EDE0" stroke="none" />
          <circle cx="62" cy="18" r="7" fill="#FFF" />
          <circle cx="62" cy="18" r="3.2" fill="#F5EDE0" stroke="none" />
          <!-- Head -->
          <ellipse cx="43" cy="38" rx="22" ry="19" fill="#FFF" />
          <!-- Body -->
          <ellipse cx="43" cy="75" rx="25" ry="24" fill="#FFF" />
          <!-- Friendly Big Eyes -->
          <circle cx="33" cy="35" r="2.2" fill="#4A3828" stroke="none" />
          <circle cx="32" cy="34" r="0.8" fill="#FFF" stroke="none" />
          <circle cx="53" cy="35" r="2.2" fill="#4A3828" stroke="none" />
          <circle cx="52" cy="34" r="0.8" fill="#FFF" stroke="none" />
          <!-- Snout & Smile -->
          <ellipse cx="43" cy="42" rx="7" ry="5" fill="#F7F1E6" />
          <ellipse cx="43" cy="40" rx="2.5" ry="1.8" fill="#4A3828" stroke="none" />
          <path d="M39 44C41 47 45 47 47 44" stroke-linecap="round" />
          <!-- Rosy Cheeks -->
          <ellipse cx="26" cy="42" rx="4" ry="2.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <ellipse cx="60" cy="42" rx="4" ry="2.2" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <!-- Little Paws -->
          <circle cx="32" cy="72" r="5" fill="#FFF" />
          <circle cx="54" cy="72" r="5" fill="#FFF" />
        </g>
        <!-- Clover & Handwriting -->
        <g transform="translate(95, 60)" stroke="#4A3828" stroke-width="1.6" fill="#F5EDE0">
          <circle cx="8" cy="8" r="4" />
          <circle cx="15" cy="8" r="4" />
          <circle cx="15" cy="15" r="4" />
          <circle cx="8" cy="15" r="4" />
        </g>
        <text x="125" y="80" fill="#4A3828" font-size="15" font-family="'Comic Sans MS', 'Outfit', cursive, sans-serif" font-weight="bold">little by little</text>
        <text x="125" y="96" fill="#7A6B5C" font-size="11" font-family="'Outfit', system-ui, sans-serif" font-weight="600">growing every day</text>
        <!-- Little Honey Pot in Bottom-Right -->
        <g transform="translate(345, 66)" stroke="#4A3828" stroke-width="1.8">
          <ellipse cx="16" cy="8" rx="8" ry="3" fill="#FFF" />
          <path d="M8 8C8 24 10 28 16 28C22 28 24 24 24 8Z" fill="#FAF6EE" />
          <path d="M12 14C14 16 18 16 20 14" stroke="#B86834" stroke-width="1.5" />
        </g>
      </svg>
    `,
  },
  {
    id: 'butter-yellow',
    name: 'Sunny Daisy Chick',
    ariaLabel: 'Warm sunny buttercup stationery with fluffy round chick, chamomile daisies, and smiling sun',
    description: 'Butter-yellow gingham frame with a cute baby chick wearing a daisy, radiant sunshine, and blossoms',
    themeClass: 'theme-butter-yellow',
    frameBg: '#FFF0A8',
    frameBorder: '#E5BD42',
    borderPatternColor: '#D9A82E',
    paperBg: '#FFF4B8',
    paperBorder: '#E8C968',
    inputBorder: 'rgba(82, 58, 18, 0.28)',
    paperShadow: '0 6px 18px rgba(180, 130, 20, 0.10), 0 2px 6px rgba(180, 130, 20, 0.05)',
    tabBg: '#FFE896',
    tabBorder: '#E2BD4C',
    tabText: '#4E3508',
    accentColor: '#C47E10',
    lineArtColor: '#523A12',
    textColor: '#3A2910',
    titleColor: '#241806',
    mutedColor: '#7C6442',
    tapeColor: 'rgba(255, 230, 130, 0.90)',
    patternType: 'grid-yellow',
    handwritingFont: "'Shadows Into Light', cursive",
    handwritingName: 'Shadows Into Light',
    motifType: 'chickDaisy',
    motifSvg: MOTIF_ICONS.chickDaisy,
    topDecorSvg: `
      <svg viewBox="0 0 400 65" fill="none" class="stationery-scattered-top" preserveAspectRatio="none">
        <!-- Smiling Doodle Sun Left -->
        <g transform="translate(40, 6)" stroke="#523A12" stroke-width="1.6">
          <circle cx="16" cy="16" r="8.5" fill="#FFE27A" />
          <line x1="16" y1="2" x2="16" y2="5" stroke-linecap="round" />
          <line x1="16" y1="27" x2="16" y2="30" stroke-linecap="round" />
          <line x1="2" y1="16" x2="5" y2="16" stroke-linecap="round" />
          <line x1="27" y1="16" x2="30" y2="16" stroke-linecap="round" />
          <line x1="6" y1="6" x2="8" y2="8" stroke-linecap="round" />
          <line x1="24" y1="24" x2="26" y2="26" stroke-linecap="round" />
          <circle cx="13" cy="15" r="0.8" fill="#523A12" stroke="none" />
          <circle cx="19" cy="15" r="0.8" fill="#523A12" stroke="none" />
          <path d="M14 18C15 19.5 17 19.5 18 18" stroke-linecap="round" />
        </g>
        <!-- Floating Heart Center -->
        <g transform="translate(185, 12)" stroke="#523A12" stroke-width="1.4">
          <path d="M6 10C4 6 8 4 10 7C12 4 16 6 14 10C12 14 10 16 10 16C10 16 8 14 6 10Z" fill="#FFD27A" />
          <path d="M22 6L23 8.5L25.5 9.5L23 10.5L22 13L21 10.5L18.5 9.5L21 8.5Z" fill="#FFE27A" stroke="#523A12" stroke-width="1" />
        </g>
        <!-- Dainty Ribbon Bow & Sparkle (Top-Right) -->
        <g transform="translate(330, 10)" stroke="#523A12" stroke-width="1.4">
          <!-- Left Rounded Loop -->
          <path d="M12 10C8 6 3 7 4 12C5 15 10 14 12 11Z" fill="#FFD268" />
          <!-- Right Rounded Loop -->
          <path d="M14 10C18 6 23 7 22 12C21 15 16 14 14 11Z" fill="#FFD268" />
          <!-- Left Ribbon Tail -->
          <path d="M11 12L7 20L9 18L11 20Z" fill="#FFD268" stroke-linejoin="round" />
          <!-- Right Ribbon Tail -->
          <path d="M15 12L19 20L17 18L15 20Z" fill="#FFD268" stroke-linejoin="round" />
          <!-- Central Soft Knot -->
          <circle cx="13" cy="11" r="2.2" fill="#FFE890" stroke="#523A12" stroke-width="1.2" />
          <!-- Little Warm Sparkle -->
          <path d="M28 8L29 11L32 12L29 13L28 16L27 13L24 12L27 11Z" fill="#FFE27A" stroke="#523A12" stroke-width="1" />
        </g>
      </svg>
    `,
    bottomDecorSvg: `
      <svg viewBox="0 0 400 120" fill="none" class="stationery-scattered-bottom" preserveAspectRatio="none">
        <!-- Cute Round Baby Chick with Daisy on Head (Bottom-Left) -->
        <g transform="translate(14, 12)" stroke="#523A12" stroke-width="2">
          <!-- Fluffy Round Chick Body -->
          <ellipse cx="40" cy="52" rx="28" ry="26" fill="#FFFDF0" />
          <!-- Big Shiny Eyes -->
          <circle cx="28" cy="46" r="2.2" fill="#523A12" stroke="none" />
          <circle cx="27" cy="45" r="0.8" fill="#FFF" stroke="none" />
          <circle cx="50" cy="46" r="2.2" fill="#523A12" stroke="none" />
          <circle cx="49" cy="45" r="0.8" fill="#FFF" stroke="none" />
          <!-- Tiny Orange Beak -->
          <polygon points="35,50 43,50 39,56" fill="#E88320" stroke="none" />
          <!-- Rosy Cheeks -->
          <ellipse cx="22" cy="52" rx="4.5" ry="2.6" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <ellipse cx="56" cy="52" rx="4.5" ry="2.6" fill="#FFAEC0" opacity="0.8" stroke="none" />
          <!-- Happy Wings -->
          <path d="M14 54C8 56 10 68 18 64" fill="#FFFDF0" />
          <path d="M64 54C70 56 68 68 60 64" fill="#FFFDF0" />
          <!-- Tiny Feet -->
          <line x1="32" y1="78" x2="32" y2="86" stroke-width="2.2" />
          <line x1="46" y1="78" x2="46" y2="86" stroke-width="2.2" />
          <!-- Chamomile Daisy on Head -->
          <circle cx="40" cy="24" r="3" fill="#E8A820" stroke="none" />
          <circle cx="40" cy="18" r="2.5" fill="#FFF" stroke="#523A12" stroke-width="1.2" />
          <circle cx="45" cy="21" r="2.5" fill="#FFF" stroke="#523A12" stroke-width="1.2" />
          <circle cx="44" cy="27" r="2.5" fill="#FFF" stroke="#523A12" stroke-width="1.2" />
          <circle cx="36" cy="27" r="2.5" fill="#FFF" stroke="#523A12" stroke-width="1.2" />
          <circle cx="35" cy="21" r="2.5" fill="#FFF" stroke="#523A12" stroke-width="1.2" />
        </g>
        <!-- Motivational Text -->
        <text x="96" y="78" fill="#523A12" font-size="15" font-family="'Comic Sans MS', 'Outfit', cursive, sans-serif" font-weight="bold">shine bright today!</text>
        <text x="96" y="94" fill="#7C6442" font-size="11" font-family="'Outfit', system-ui, sans-serif" font-weight="600">you bring the warmth</text>
        <!-- Charming Decorative Ribbon Bow & Sparkle (Bottom-Right) -->
        <g transform="translate(335, 66)" stroke="#523A12" stroke-width="1.6">
          <!-- Left Rounded Loop -->
          <path d="M16 13C10 7 3 9 4 15C5 20 12 18 16 14Z" fill="#FFD268" />
          <!-- Right Rounded Loop -->
          <path d="M19 13C25 7 32 9 31 15C30 20 23 18 19 14Z" fill="#FFD268" />
          <!-- Left Flowing Ribbon Tail -->
          <path d="M14 16C12 22 9 27 7 30L11 27L14 29Z" fill="#FFD268" stroke-linejoin="round" />
          <!-- Right Flowing Ribbon Tail -->
          <path d="M21 16C23 22 26 27 28 30L24 27L21 29Z" fill="#FFD268" stroke-linejoin="round" />
          <!-- Central Soft Knot -->
          <circle cx="17.5" cy="14" r="3.2" fill="#FFE27A" stroke="#523A12" stroke-width="1.5" />
          <!-- Tiny Accompanying Sparkle Star -->
          <path d="M38 12L39.5 16L43.5 17.5L39.5 19L38 23L36.5 19L32.5 17.5L36.5 16Z" fill="#FFE27A" stroke="#523A12" stroke-width="1.2" />
          <circle cx="4" cy="8" r="1" fill="#E88320" stroke="none" />
        </g>
      </svg>
    `,
  },
  {
    id: 'matcha-leaf',
    name: 'Serene Matcha Clover',
    ariaLabel: 'Botanical matcha green stationery with cheerful umbrella frog, four-leaf clovers, and gentle dewdrops',
    description: 'Matcha tea green frame with a happy frog under a clover umbrella, botanical vines, and lucky clovers',
    themeClass: 'theme-matcha-leaf',
    frameBg: '#EEF6E6',
    frameBorder: '#AFD294',
    borderPatternColor: '#93C072',
    paperBg: '#F3F8ED',
    paperBorder: '#CAE3B6',
    inputBorder: 'rgba(43, 74, 29, 0.28)',
    paperShadow: '0 6px 18px rgba(60, 100, 40, 0.09), 0 2px 6px rgba(60, 100, 40, 0.05)',
    tabBg: '#E0EED2',
    tabBorder: '#C0D9AA',
    tabText: '#264718',
    accentColor: '#4A802A',
    lineArtColor: '#2B4A1D',
    textColor: '#213318',
    titleColor: '#14240D',
    mutedColor: '#58734C',
    tapeColor: 'rgba(224, 238, 210, 0.85)',
    patternType: 'dots-matcha',
    handwritingFont: "'Rouge Script', cursive",
    handwritingName: 'Rouge Script',
    motifType: 'frogClover',
    motifSvg: MOTIF_ICONS.frogClover,
    topDecorSvg: `
      <svg viewBox="0 0 400 65" fill="none" class="stationery-scattered-top" preserveAspectRatio="none">
        <!-- Floating Lily Pad Motif with Notch, Veins & Ripple (Top-Left) -->
        <g transform="translate(34, 10)" stroke="#2B4A1D" stroke-width="1.6">
          <!-- Gentle Water Ripple Arc -->
          <path d="M2 28C8 32 24 32 30 28" stroke="#93C072" stroke-width="1.3" fill="none" stroke-linecap="round" />
          <!-- Rounded Lily Pad Leaf with V-Notch -->
          <path d="M16 16 L27 11 C30 16 29 22 25 26 C20 31 12 31 7 26 C2 21 2 13 7 8 C12 3 20 3 25 7 Z" fill="#C6E2AE" />
          <!-- Radiating Veins from Notch -->
          <path d="M16 16L8 12M16 16L8 22M16 16L16 27M16 16L22 23" stroke="#2B4A1D" stroke-width="1.1" stroke-linecap="round" fill="none" />
          <!-- Tiny Dewdrop Sparkle -->
          <circle cx="11" cy="14" r="1.3" fill="#FFF" stroke="#2B4A1D" stroke-width="0.9" />
        </g>
        <!-- Four Leaf Clover Center -->
        <g transform="translate(185, 10)" stroke="#2B4A1D" stroke-width="1.6" fill="#E0EED2">
          <circle cx="8" cy="8" r="4.5" />
          <circle cx="16" cy="8" r="4.5" />
          <circle cx="16" cy="16" r="4.5" />
          <circle cx="8" cy="16" r="4.5" />
        </g>
        <!-- Dewdrops Right -->
        <g transform="translate(330, 12)" stroke="#2B4A1D" stroke-width="1.4" fill="#FFF">
          <path d="M10 2C6 8 4 12 4 16C4 20 7 22 10 22C13 22 16 20 16 16C16 12 14 8 10 2Z" fill="#E0EED2" />
        </g>
      </svg>
    `,
    bottomDecorSvg: `
      <svg viewBox="0 0 400 120" fill="none" class="stationery-scattered-bottom" preserveAspectRatio="none">
        <!-- Charming Happy Frog with Clover Umbrella (Bottom-Right) -->
        <g transform="translate(285, 8)" stroke="#2B4A1D" stroke-width="2">
          <!-- Large Four-Leaf Clover Umbrella -->
          <g transform="translate(10, 0)" fill="#C6E2AE">
            <path d="M22 6C12 -2 2 12 16 20C4 26 14 42 26 32C36 42 48 28 36 20C48 10 34 -4 22 6Z" stroke="#2B4A1D" stroke-width="2" />
            <line x1="24" y1="20" x2="24" y2="58" stroke="#2B4A1D" stroke-width="2.5" />
          </g>
          <!-- Happy Little Round Frog Underneath -->
          <g transform="translate(18, 42)">
            <!-- Eye bumps -->
            <circle cx="10" cy="10" r="6" fill="#E9F7E8" />
            <circle cx="26" cy="10" r="6" fill="#E9F7E8" />
            <circle cx="10" cy="10" r="2.2" fill="#2B4A1D" stroke="none" />
            <circle cx="26" cy="10" r="2.2" fill="#2B4A1D" stroke="none" />
            <!-- Head & Body -->
            <ellipse cx="18" cy="22" rx="16" ry="12" fill="#E9F7E8" />
            <!-- Wide Happy Smile -->
            <path d="M10 22C14 26 22 26 26 22" stroke-linecap="round" />
            <!-- Rosy Cheeks -->
            <ellipse cx="7" cy="22" rx="3.5" ry="1.8" fill="#FFAEC0" opacity="0.8" stroke="none" />
            <ellipse cx="29" cy="22" rx="3.5" ry="1.8" fill="#FFAEC0" opacity="0.8" stroke="none" />
            <!-- Tiny Webbed Feet -->
            <ellipse cx="8" cy="34" rx="4" ry="2" fill="#E9F7E8" />
            <ellipse cx="28" cy="34" rx="4" ry="2" fill="#E9F7E8" />
          </g>
        </g>
        <!-- Lucky Text Prompt (Bottom-Left) -->
        <g transform="translate(18, 60)" stroke="#2B4A1D" stroke-width="1.6" fill="#C6E2AE">
          <circle cx="8" cy="8" r="4.2" />
          <circle cx="16" cy="8" r="4.2" />
          <circle cx="16" cy="16" r="4.2" />
          <circle cx="8" cy="16" r="4.2" />
          <path d="M12 16C12 24 16 28 20 30" stroke="#2B4A1D" stroke-width="1.6" fill="none" />
        </g>
        <text x="56" y="80" fill="#2B4A1D" font-size="15" font-family="'Comic Sans MS', 'Outfit', cursive, sans-serif" font-weight="bold">lucky days ahead</text>
        <text x="56" y="96" fill="#58734C" font-size="11" font-family="'Outfit', system-ui, sans-serif" font-weight="600">good things take time</text>
      </svg>
    `,
  },
];

/**
 * Returns stationery style by id with safe fallback to Morning Sky Bear.
 */
export function getStationeryById(styleId) {
  if (!styleId) return STATIONERY_STYLES[0];
  const found = STATIONERY_STYLES.find((s) => s.id === styleId);
  return found || STATIONERY_STYLES[0];
}

/**
 * The approved six sticky-note handwriting fonts.
 * Birthstone Bounce was removed and replaced by Rouge Script for Serene Matcha.
 */
export const STICKY_NOTE_HANDWRITING_FONTS = [
  { id: 'la-belle-aurore', name: 'La Belle Aurore', family: "'La Belle Aurore', cursive", designer: 'Kimberly Geswein', stationeryId: 'blush-bunny', stationeryName: 'Sakura Blush Bunny' },
  { id: 'sue-ellen-francisco', name: 'Sue Ellen Francisco', family: "'Sue Ellen Francisco', cursive", designer: 'Kimberly Geswein', stationeryId: 'powder-blue', stationeryName: 'Morning Sky Bear' },
  { id: 'indie-flower', name: 'Indie Flower', family: "'Indie Flower', cursive", designer: 'Kimberly Geswein', stationeryId: 'mint-bear', stationeryName: 'Almond Forest Bear' },
  { id: 'shadows-into-light', name: 'Shadows Into Light', family: "'Shadows Into Light', cursive", designer: 'Kimberly Geswein', stationeryId: 'butter-yellow', stationeryName: 'Sunny Daisy Chick' },
  { id: 'ephesis', name: 'Ephesis', family: "'Ephesis', cursive", designer: 'Robert Leuschke', stationeryId: 'lavender-cat', stationeryName: 'Wisteria Lavender Cat' },
  { id: 'rouge-script', name: 'Rouge Script', family: "'Rouge Script', cursive", designer: 'Brenda Gallo', stationeryId: 'matcha-leaf', stationeryName: 'Serene Matcha Clover' },
];
