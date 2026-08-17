/* Forage sprite registry — biome-restricted creature/flora picks.
 *
 * Variants are explicit suffix lists rather than counts because the file
 * naming has gaps (e.g. fauna_mouse + fauna_mouse3 with no mouse2; only
 * fauna_yeti2 and no fauna_yeti). The list is the truth of what's on disk.
 *
 * has_bad: false means decoys NEVER spawn from this species. Currently
 * fox + (no — scorpion has _b now) → only fox. Players learn "fox is
 * always a real catch" as a quiet reliability beat.
 */
window.FORAGE_SPRITES = {
  fauna: {
    rat:        { variants:['','2','3'],     has_bad:true,  biomes:['ship_interior'] },
    roach:      { variants:['','2','3','4'], has_bad:true,  biomes:['ship_interior'] },
    ratlizard:  { variants:[''],             has_bad:true,  biomes:['ship_interior','asteroid','desert'] },
    mouse:      { variants:['','3'],         has_bad:true,  biomes:['asteroid'] },
    scorpion:   { variants:[''],             has_bad:true,  biomes:['asteroid','desert'] },
    cute:       { variants:[''],             has_bad:true,  biomes:['asteroid','ice','desert','forest','meadow'] },
    yeti:       { variants:['2'],            has_bad:true,  biomes:['ice'] },
    snowrabbit: { variants:[''],             has_bad:true,  biomes:['ice'] },
    fox:        { variants:['','2'],         has_bad:false, biomes:['ice','forest'] },
    squirrel:   { variants:['','2'],         has_bad:true,  biomes:['forest','meadow'] },
    armadillo:  { variants:['','2'],         has_bad:true,  biomes:['desert'] },
    grassmouse: { variants:['','2'],         has_bad:true,  biomes:['meadow'] }
  },
  flora: {
    fruit: {
      sizes: { s:['','2','3'], m:['','2'], l:['','2'] },
      has_bad: true,
      biomes: ['forest','meadow','desert']
    },
    seedpod: {
      sizes: { s:['','2','3'] },
      has_bad: true,
      biomes: ['forest','meadow']
    },
    shroom: {
      sizes: { s:['','2','3','4','5'], m:['','2','3'], l:['','2','3'] },
      has_bad: true,
      biomes: ['cave']
    }
  }
};
