'use strict';

/**
 * SANDSIAM · App settings and fixed lists shared by the interface.
 * Needs js/scene/ornaments/catalog.js (RING, INCENSE) and core.js (PALETTE).
 */

const STORAGE_KEY = 'sandsiam-v1';
const LANG_KEY = 'sandsiam-lang';
const MAX_OBJECTS = 40;
const LAST_STEP = 4;
const ZOOM = { min: 0.7, max: 1.35, step: 0.1 };
const PLACES = ['north', 'central', 'isan', 'east', 'south'];
/**
 * The game's public home (GitHub Pages, .github/workflows/pages.yml). Shared links point here
 * when the page can't use its own address: inside a claude.ai Artifact, or on a computer's
 * own test server (localhost), which nobody else can open. Change it if the site moves.
 */
const SITE_URL = 'https://puimekstu03-afk.github.io/sandsiam-kids/';
/**
 * The share server (share-server/), e.g. 'https://<project>.vercel.app'. Links to a pagoda in
 * the field go through it, so Facebook, X and LINE show that pagoda's own picture. Empty: links
 * open the game directly and every link shows the same picture (assets/share/card.jpg).
 */
const SHARE_URL = 'https://sandsiam-share.vercel.app';
const INTRO_SLIDE = 6; // seconds each region stays on the intro screen
const REVEAL_TIME = 2.6; // seconds for the pagoda to rise and decorations to pop in

/**
 * Decorations shown in each tab (type numbers from ORNAMENTS):
 * flags & offerings · flowers · Thai things · cute things.
 */
const TAB_ITEMS = [
  [0, 1, 2, 21, 40, 41, 42, 43, 44, 45, 46, 47, 48, 19, INCENSE, 20, 22],
  [3, 4, 11, 12, 13, 14, 15, 16, 31, 17, 18, 5, RING, 36, 32, 33, 34, 35, 38, 39, 37],
  [6, 7, 8, 23, 24, 25],
  [26, 27, 28, 29, 30],
];

/** Pagoda heights behind the short / medium / tall buttons. */
const HEIGHTS = [0.85, 1, 1.15];

/** Colour of each region on the map and its chips: north, central, isan, east, south. */
const REGION_COLORS = ['#7ad36b', '#ffc93c', '#ff7a7a', '#4cc3ff', '#b98bff'];

/** The guide's pose for each step. */
const GUIDE_POSES = ['point', 'point', 'point', 'think', 'cheer'];

/** One collectible sticker per step: a decoration picture in assets/ornaments/. */
const STICKERS = ['tung', 'marigold', 'lotus', 'prajamyam', 'sunflower'];

/** One picture per step, so children can follow the bar without reading (icons in the sprite in index.html). */
const STEP_ICONS = ['map-pin', 'castle', 'flower', 'mail', 'star'];
