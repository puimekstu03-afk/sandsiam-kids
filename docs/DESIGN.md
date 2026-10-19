# SANDSIAM Kids · visual system

A cartoon redesign of SANDSIAM for children in Prathom 1–6. Everything should feel like a sticker book or a toy: soft, round, bright and easy to tap.

## Shape language
- **Thick plum outlines** (`--ink: #3d2c52`) round every button, card, chip and dialog — never pure black.
- **Hard "toy" shadows** (`0 5px 0 var(--ink)`): buttons lift on hover and press down on tap.
- **Big radii**: 14 / 20 / 28 px; pills for buttons and chips.
- **Stickers**: photo cut-outs (decorations, flowers, the guide) get a white edge, in CSS (`drop-shadow`) and on the canvas (`stickerize` in `js/scene/sprites.js`).

## Colour
Candy colours, each with a deep and a soft partner: sky `#4cc3ff`, sun `#ffd23f`, pink `#ff6fa5`, mint `#47d18c`, grape `#a77bff`, orange `#ff9a3c`. The sun-yellow button is the single main action per view. Each step and each region has its own colour (step bar, map, region chips).

## Type
- **Mali** for headings, buttons and blessings: rounded and friendly.
- **Mali** for body text too (500): a child's handwriting with the looped letterforms Thai children learn first, so the whole page reads as one friendly hand.
- **ZCOOL KuaiLe** for Chinese headings, **Noto Sans SC** for Chinese body text.
- Body 18 px; buttons at least 48 px tall.

## Backdrops
Five cartoon backdrops drawn in Canvas 2D (`js/scene/backgrounds.js`), painted once at 1920×1200 and reused like photos:

| Region | Scene |
|---|---|
| North · Chiang Mai | Lanna temple, blue mountains, golden chedi, tung banners, blossom tree |
| Central · Bangkok | Wat Arun across the river, long-tail boat, temple wall, sala, palms |
| Isan · Buriram | Phanom Rung on its hill, rice fields, sugar palms, a buffalo |
| East · Bang Saen | Beach, sailboats, umbrellas, beach ball, starfish |
| South · coast | Dusk, limestone islands, rows of prieng shell lamps that flicker |

All share a smiling sun (sleepy at dusk in the South), clouds with faces, a sandy courtyard and tiny sand pagodas with flags. Live on top: drifting clouds, flapping birds, petals, water splashes, sea glints.

## Layout
- **Desktop**: the scene fills the left; the panel floats on the right as a paper card with a dotted pattern, inset from the edges so the polka-dot sky shows around it.
- **Phones**: the scene on top, the panel as a sheet below it with a rounded, outlined top edge.

## Motion
Bouncy, short (180–300 ms) and playful: buttons press, decoration tiles wiggle on hover, earned stickers sway, the start button wiggles to invite a tap, and the guide bobs. Everything stops under `prefers-reduced-motion`.
