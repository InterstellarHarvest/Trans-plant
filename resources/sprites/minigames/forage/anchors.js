/* Forage anchor registry — runtime canonical source.
 *
 * Workflow:
 *   1. Author anchors visually in resources/forage-anchor-editor.html
 *   2. Editor exports <bg_id>.json (also saves alongside the bg jpg)
 *   3. Paste the `anchors` array from that JSON into the matching entry below
 *
 * Why this file (and not fetch'd JSON)?
 *   Browsers block fetch() over file:// for security. The other demos in
 *   this project don't fetch — they inline data. Following that pattern
 *   lets you double-click demo-minigames.html and have it work, with no
 *   local server step.
 *
 * Once the engine layer ships and assets are HTTP-served, the runtime can
 * fall back to fetching <bg_id>.json directly (initForage already tries
 * fetch first when not on file://). This file becomes optional then.
 */
window.FORAGE_ANCHORS = window.FORAGE_ANCHORS || {};

/* ─────────────────────────────────────────────────────────────────
 * SCAVENGE — ship interior, vermin only
 * ─────────────────────────────────────────────────────────────── */
window.FORAGE_ANCHORS.scav = {
  storage: { anchors: [
    { type:'line', x1:54,  y1:637, x2:919, y2:637, target:'fauna' },
    { type:'line', x1:818, y1:399, x2:818, y2:434, target:'fauna', face:'left',  spawn:'midpoint', depth:'mid' },
    { type:'line', x1:141, y1:399, x2:141, y2:429, target:'fauna', face:'right', spawn:'midpoint', depth:'mid' },
    { type:'line', x1:149, y1:279, x2:149, y2:320, target:'fauna', face:'right', spawn:'midpoint', depth:'mid' },
    { type:'line', x1:565, y1:242, x2:591, y2:242, target:'fauna', spawn:'midpoint', depth:'far' },
    { type:'line', x1:256, y1:362, x2:351, y2:362, target:'fauna', depth:'far' },
    { type:'line', x1:726, y1:364, x2:726, y2:403, target:'fauna', face:'left',  depth:'far', spawn:'midpoint' },
    { type:'line', x1:798, y1:284, x2:798, y2:324, target:'fauna', face:'left',  depth:'far', spawn:'midpoint' },
    { type:'line', x1:873, y1:156, x2:873, y2:210, target:'fauna', face:'left',  depth:'mid', spawn:'midpoint' },
    { type:'line', x1:84,  y1:155, x2:84,  y2:209, target:'fauna', face:'right', depth:'mid', spawn:'midpoint' },
    { type:'line', x1:267, y1:0,   x2:692, y2:0,   target:'fauna', face:'down',  spawn:'midpoint' },
    { type:'line', x1:888, y1:470, x2:948, y2:492, target:'fauna', spawn:'midpoint', depth:'mid' },
    { type:'line', x1:17,  y1:489, x2:72,  y2:470, target:'fauna', spawn:'midpoint', depth:'mid' }
  ]},
  service: { anchors: [
    { type:'line', x1:113, y1:479, x2:146, y2:523, target:'fauna', face:'right', depth:'far', spawn:'end' },
    { type:'line', x1:843, y1:485, x2:816, y2:520, target:'fauna', face:'left',  depth:'far', spawn:'end' },
    { type:'line', x1:155, y1:1,   x2:803, y2:1,   target:'fauna', face:'down' },
    { type:'line', x1:959, y1:317, x2:959, y2:353, target:'fauna', face:'left',  depth:'mid', spawn:'end' },
    { type:'line', x1:1,   y1:315, x2:1,   y2:349, target:'fauna', face:'right', depth:'mid', spawn:'end' },
    { type:'line', x1:40,  y1:638, x2:925, y2:638, target:'fauna' },
    { type:'line', x1:731, y1:89,  x2:749, y2:110, target:'fauna', face:'left',  depth:'far', spawn:'midpoint' },
    { type:'line', x1:238, y1:91,  x2:215, y2:109, target:'fauna', face:'right', depth:'far', spawn:'midpoint' },
    { type:'line', x1:957, y1:526, x2:957, y2:638, target:'fauna', face:'left',  spawn:'midpoint' },
    { type:'line', x1:1,   y1:521, x2:1,   y2:636, target:'fauna', face:'right', spawn:'midpoint' }
  ]},
  pantry: { anchors: [
    { type:'line', x1:225, y1:532, x2:318, y2:532, target:'fauna' },
    { type:'line', x1:205, y1:395, x2:205, y2:464, target:'fauna', face:'right', depth:'mid', spawn:'midpoint' },
    { type:'line', x1:754, y1:391, x2:754, y2:461, target:'fauna', face:'left',  depth:'mid', spawn:'midpoint' },
    { type:'line', x1:231, y1:290, x2:231, y2:310, target:'fauna', face:'right', depth:'far', spawn:'midpoint' },
    { type:'line', x1:367, y1:335, x2:367, y2:390, target:'fauna', face:'right', depth:'far', spawn:'midpoint' },
    { type:'line', x1:250, y1:0,   x2:712, y2:0,   target:'fauna', face:'down' },
    { type:'line', x1:16,  y1:638, x2:932, y2:638, target:'fauna' },
    { type:'line', x1:593, y1:326, x2:593, y2:390, target:'fauna', face:'left',  depth:'far', spawn:'midpoint' },
    { type:'line', x1:379, y1:173, x2:582, y2:173, target:'fauna', face:'down',  depth:'far', spawn:'midpoint' },
    { type:'line', x1:232, y1:227, x2:232, y2:255, target:'fauna', face:'right', depth:'far', spawn:'midpoint' },
    { type:'line', x1:753, y1:271, x2:753, y2:314, target:'fauna', face:'left',  depth:'far', spawn:'midpoint' }
  ]}
};

/* ─────────────────────────────────────────────────────────────────
 * HUNT — exterior fauna (asteroid / ice / desert)
 *   desert2 also has flora (cactus-like fruit on visible plants)
 * ─────────────────────────────────────────────────────────────── */
window.FORAGE_ANCHORS.hunt = {
  asteroid: { anchors: [
    { type:'line', x1:675, y1:557, x2:752, y2:557, target:'fauna' },
    { type:'line', x1:313, y1:547, x2:378, y2:547, target:'fauna' },
    { type:'line', x1:243, y1:543, x2:292, y2:554, target:'fauna' },
    { type:'line', x1:107, y1:457, x2:167, y2:457, target:'fauna', depth:'mid' },
    { type:'line', x1:198, y1:452, x2:262, y2:435, target:'fauna', depth:'mid' },
    { type:'line', x1:544, y1:368, x2:625, y2:368, target:'fauna', depth:'mid' },
    { type:'line', x1:667, y1:341, x2:742, y2:341, target:'fauna', depth:'mid' },
    { type:'line', x1:656, y1:265, x2:710, y2:265, target:'fauna', depth:'far' },
    { type:'line', x1:582, y1:259, x2:617, y2:269, target:'fauna', depth:'far' },
    { type:'line', x1:843, y1:296, x2:895, y2:309, target:'fauna', depth:'far' },
    { type:'line', x1:929, y1:311, x2:957, y2:311, target:'fauna', depth:'far', spawn:'start' },
    { type:'line', x1:283, y1:334, x2:314, y2:334, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:442, y1:232, x2:488, y2:232, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:125, y1:270, x2:210, y2:261, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:252, y1:234, x2:297, y2:234, target:'fauna', depth:'far', spawn:'midpoint' }
  ]},
  asteroid2: { anchors: [
    { type:'line', x1:832, y1:639, x2:928, y2:639, target:'fauna' },
    { type:'line', x1:419, y1:461, x2:546, y2:461, target:'fauna' },
    { type:'line', x1:5,   y1:638, x2:78,  y2:638, target:'fauna' },
    { type:'line', x1:284, y1:327, x2:326, y2:327, target:'fauna', depth:'far' },
    { type:'line', x1:754, y1:595, x2:788, y2:595, target:'fauna', depth:'far' },
    { type:'line', x1:834, y1:338, x2:892, y2:338, target:'fauna', depth:'mid' },
    { type:'line', x1:160, y1:386, x2:227, y2:386, target:'fauna', depth:'mid' },
    { type:'line', x1:124, y1:613, x2:194, y2:613, target:'fauna' },
    { type:'line', x1:444, y1:372, x2:478, y2:372, target:'fauna', depth:'far' },
    { type:'line', x1:13,  y1:407, x2:50,  y2:407, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:907, y1:364, x2:957, y2:364, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:649, y1:446, x2:708, y2:446, target:'fauna', depth:'mid', spawn:'midpoint' },
    { type:'line', x1:612, y1:319, x2:642, y2:319, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:803, y1:309, x2:840, y2:309, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:353, y1:315, x2:395, y2:315, target:'fauna', depth:'far', spawn:'midpoint' }
  ]},
  asteroid3: { anchors: [
    { type:'line', x1:560, y1:556, x2:656, y2:556, target:'fauna' },
    { type:'line', x1:837, y1:639, x2:957, y2:639, target:'fauna' },
    { type:'line', x1:89,  y1:587, x2:176, y2:587, target:'fauna' },
    { type:'line', x1:333, y1:482, x2:379, y2:482, target:'fauna', depth:'mid', spawn:'midpoint' },
    { type:'line', x1:612, y1:320, x2:647, y2:320, target:'fauna', depth:'far' },
    { type:'line', x1:758, y1:221, x2:799, y2:221, target:'fauna', depth:'far' },
    { type:'line', x1:63,  y1:376, x2:93,  y2:376, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:358, y1:248, x2:392, y2:248, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:447, y1:410, x2:489, y2:410, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:873, y1:234, x2:933, y2:234, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:51,  y1:278, x2:82,  y2:278, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:699, y1:285, x2:735, y2:285, target:'fauna', depth:'far', spawn:'midpoint' }
  ]},
  desert: { anchors: [
    { type:'point', x:28,  y:278, target:'fauna', depth:'far' },
    { type:'point', x:65,  y:324, target:'fauna', depth:'far' },
    { type:'point', x:266, y:534, target:'fauna', depth:'far' },
    { type:'point', x:312, y:548, target:'fauna', depth:'far' },
    { type:'point', x:521, y:549, target:'fauna', depth:'far' },
    { type:'point', x:530, y:505, target:'fauna', depth:'far' },
    { type:'point', x:618, y:576, target:'fauna', depth:'far' },
    { type:'point', x:656, y:536, target:'fauna', depth:'far' },
    { type:'point', x:657, y:574, target:'fauna', depth:'far' },
    { type:'point', x:692, y:554, target:'fauna', depth:'far' },
    { type:'point', x:753, y:443, target:'fauna', depth:'far' },
    { type:'point', x:782, y:413, target:'fauna', depth:'far' },
    { type:'point', x:809, y:449, target:'fauna', depth:'far' },
    { type:'line',  x1:478, y1:638, x2:698, y2:638, target:'fauna', spawn:'midpoint' },
    { type:'line',  x1:366, y1:453, x2:481, y2:468, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line',  x1:355, y1:507, x2:387, y2:507, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line',  x1:67,  y1:423, x2:67,  y2:486, target:'fauna', depth:'far', face:'right', spawn:'midpoint' },
    { type:'line',  x1:958, y1:400, x2:958, y2:448, target:'fauna', face:'left',  depth:'far', spawn:'end' },
    { type:'line',  x1:28,  y1:637, x2:263, y2:637, target:'fauna' }
  ]},
  desert2: { anchors: [
    { type:'point', x:323, y:600, target:'flora', depth:'far' },
    { type:'point', x:589, y:566, target:'flora', depth:'far' },
    { type:'point', x:683, y:589, target:'flora', depth:'far' },
    { type:'point', x:637, y:550, target:'flora', depth:'far' },
    { type:'point', x:633, y:587, target:'flora', depth:'far' },
    { type:'point', x:590, y:461, target:'flora', depth:'far' },
    { type:'point', x:612, y:432, target:'flora', depth:'far' },
    { type:'point', x:638, y:458, target:'flora', depth:'far' },
    { type:'point', x:874, y:479, target:'flora', depth:'far' },
    { type:'point', x:701, y:413, target:'flora', depth:'far' },
    { type:'point', x:277, y:487, target:'flora', depth:'far' },
    { type:'point', x:49,  y:426, target:'flora', depth:'far' },
    { type:'point', x:238, y:426, target:'flora', depth:'far' },
    { type:'point', x:288, y:432, target:'flora', depth:'far' },
    { type:'line',  x1:44,  y1:639, x2:896, y2:639, target:'fauna' },
    { type:'line',  x1:871, y1:523, x2:931, y2:523, target:'fauna', depth:'mid' },
    { type:'line',  x1:457, y1:530, x2:486, y2:530, target:'fauna', depth:'mid' },
    { type:'line',  x1:102, y1:490, x2:182, y2:490, target:'fauna', depth:'far' },
    { type:'line',  x1:747, y1:413, x2:792, y2:413, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line',  x1:18,  y1:488, x2:63,  y2:488, target:'fauna', spawn:'end' },
    { type:'line',  x1:842, y1:384, x2:881, y2:384, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line',  x1:960, y1:437, x2:960, y2:518, target:'fauna', face:'left',  depth:'mid', spawn:'midpoint' },
    { type:'line',  x1:0,   y1:392, x2:0,   y2:472, target:'fauna', face:'right', depth:'mid', spawn:'midpoint' }
  ]},
  ice: { anchors: [
    { type:'line', x1:306, y1:639, x2:766, y2:639, target:'fauna' },
    { type:'line', x1:58,  y1:638, x2:172, y2:638, target:'fauna' },
    { type:'line', x1:649, y1:501, x2:637, y2:530, target:'fauna', face:'left', depth:'far' },
    { type:'line', x1:0,   y1:479, x2:0,   y2:537, target:'fauna', face:'right', depth:'mid', spawn:'midpoint' },
    { type:'line', x1:693, y1:474, x2:766, y2:474, target:'fauna', spawn:'midpoint', depth:'far' },
    { type:'line', x1:888, y1:428, x2:927, y2:428, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:455, y1:465, x2:505, y2:465, target:'fauna', depth:'mid', spawn:'midpoint' },
    { type:'line', x1:305, y1:464, x2:341, y2:464, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:151, y1:455, x2:181, y2:455, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line', x1:959, y1:509, x2:959, y2:542, target:'fauna', face:'left', depth:'far', spawn:'start' },
    { type:'line', x1:14,  y1:423, x2:105, y2:423, target:'fauna', spawn:'start', depth:'mid' }
  ]},
  ice2: { anchors: [
    { type:'line', x1:4,   y1:639, x2:733, y2:639, target:'fauna' },
    { type:'line', x1:875, y1:467, x2:955, y2:467, target:'fauna', depth:'mid', spawn:'midpoint' },
    { type:'line', x1:2,   y1:471, x2:2,   y2:585, target:'fauna', face:'right', depth:'mid', spawn:'midpoint' },
    { type:'line', x1:603, y1:530, x2:619, y2:565, target:'fauna', depth:'far', spawn:'midpoint', face:'right' },
    { type:'line', x1:303, y1:503, x2:283, y2:538, target:'fauna', depth:'far', spawn:'midpoint', face:'left' }
  ]}
};

/* ─────────────────────────────────────────────────────────────────
 * GATHER — exterior fauna+flora (forest / meadow / cave)
 * ─────────────────────────────────────────────────────────────── */
window.FORAGE_ANCHORS.gather = {
  forest: { anchors: [
    { type:'region', x:29,  y:563, w:104, h:47, target:'flora' },
    { type:'region', x:884, y:552, w:56,  h:68, target:'flora' },
    { type:'region', x:772, y:608, w:99,  h:22, target:'flora', depth:'mid' },
    { type:'region', x:26,  y:452, w:168, h:86, target:'flora', depth:'mid' },
    { type:'region', x:212, y:487, w:124, h:40, target:'flora', depth:'mid' },
    { type:'region', x:288, y:451, w:79,  h:33, target:'flora', depth:'far' },
    { type:'region', x:794, y:450, w:116, h:84, target:'flora', depth:'mid' },
    { type:'region', x:768, y:549, w:100, h:25, target:'flora', depth:'far' },
    { type:'region', x:718, y:441, w:74,  h:40, target:'flora', depth:'far' },
    { type:'region', x:631, y:429, w:79,  h:46, target:'flora', depth:'far' },
    { type:'line',   x1:917, y1:457, x2:917, y2:529, depth:'mid', face:'left',  spawn:'midpoint' },
    { type:'line',   x1:239, y1:637, x2:719, y2:637, target:'fauna', spawn:'midpoint' },
    { type:'line',   x1:249, y1:427, x2:249, y2:466, target:'fauna', depth:'far', spawn:'midpoint', face:'right' },
    { type:'line',   x1:35,  y1:391, x2:35,  y2:437, target:'fauna', face:'right', spawn:'midpoint', depth:'mid' },
    { type:'line',   x1:745, y1:498, x2:745, y2:533, target:'fauna', face:'left',  depth:'mid', spawn:'midpoint' },
    { type:'point',  x:317, y:128, target:'flora', depth:'far' },
    { type:'point',  x:549, y:171, target:'flora', face:'left', depth:'far' },
    { type:'point',  x:601, y:148, target:'flora', face:'left', depth:'far' },
    { type:'point',  x:653, y:155, target:'flora', face:'left', depth:'far' },
    { type:'point',  x:386, y:130, target:'flora', depth:'far' },
    { type:'point',  x:689, y:57,  target:'flora', depth:'far' },
    { type:'point',  x:512, y:76,  target:'flora', depth:'far' },
    { type:'point',  x:460, y:97,  target:'flora', depth:'far' },
    { type:'point',  x:748, y:109, target:'flora', depth:'far' },
    { type:'point',  x:802, y:32,  target:'flora', depth:'far' }
  ]},
  forest2: { anchors: [
    { type:'region', x:615, y:527, w:97, h:64, target:'flora', depth:'mid' },
    { type:'region', x:268, y:521, w:46, h:36, target:'flora', depth:'far' },
    { type:'line',   x1:835, y1:441, x2:823, y2:512, face:'left' },
    { type:'line',   x1:889, y1:423, x2:897, y2:480, target:'flora', spawn:'midpoint', face:'right', depth:'mid' },
    { type:'line',   x1:701, y1:452, x2:692, y2:493, target:'fauna', face:'left',  spawn:'midpoint', depth:'far' },
    { type:'line',   x1:443, y1:473, x2:489, y2:473, target:'fauna', spawn:'midpoint', depth:'far' },
    { type:'line',   x1:134, y1:429, x2:134, y2:508, target:'fauna', spawn:'midpoint', face:'right', depth:'mid' },
    { type:'line',   x1:75,  y1:410, x2:64,  y2:492, target:'fauna', face:'left',  spawn:'midpoint', depth:'mid' },
    { type:'point',  x:368, y:527, target:'flora', face:'left', depth:'far' },
    { type:'point',  x:244, y:472, target:'flora', face:'left', depth:'far' },
    { type:'line',   x1:248, y1:413, x2:258, y2:440, spawn:'midpoint', face:'right', depth:'far' },
    { type:'line',   x1:602, y1:447, x2:642, y2:439, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'point',  x:404, y:122, target:'fauna', face:'right', depth:'far' },
    { type:'point',  x:630, y:48,  target:'fauna', face:'right', depth:'far' },
    { type:'point',  x:576, y:133, target:'fauna', face:'right', depth:'far' },
    { type:'point',  x:313, y:83,  target:'fauna', face:'right', depth:'far' }
  ]},
  meadow: { anchors: [
    { type:'line',  x1:0,   y1:483, x2:0,   y2:557, target:'fauna', face:'right', spawn:'midpoint', depth:'mid' },
    { type:'line',  x1:85,  y1:639, x2:904, y2:639, target:'fauna' },
    { type:'line',  x1:238, y1:535, x2:281, y2:535, target:'fauna', depth:'mid', spawn:'midpoint' },
    { type:'line',  x1:532, y1:511, x2:579, y2:503, target:'fauna', depth:'mid' },
    { type:'line',  x1:814, y1:360, x2:814, y2:394, target:'flora', face:'right', depth:'far', spawn:'midpoint' },
    { type:'line',  x1:959, y1:430, x2:959, y2:479, target:'fauna', face:'left',  depth:'mid' },
    { type:'line',  x1:15,  y1:400, x2:36,  y2:435, target:'fauna', face:'right', depth:'far' },
    { type:'line',  x1:757, y1:392, x2:757, y2:412, target:'fauna', face:'left',  depth:'far', spawn:'midpoint' },
    { type:'point', x:119, y:340, target:'flora', face:'right', depth:'far' },
    { type:'point', x:173, y:371, target:'flora', face:'right', depth:'far' },
    { type:'point', x:286, y:399, target:'flora', face:'right', depth:'far' },
    { type:'point', x:598, y:406, target:'flora', face:'right', depth:'far' },
    { type:'point', x:731, y:375, target:'flora', face:'right', depth:'far' },
    { type:'line',  x1:866, y1:360, x2:910, y2:331, spawn:'midpoint', depth:'mid' },
    { type:'line',  x1:417, y1:463, x2:454, y2:472, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line',  x1:192, y1:426, x2:181, y2:450, target:'fauna', depth:'far', spawn:'start', face:'left' }
  ]},
  meadow2: { anchors: [
    { type:'point', x:728, y:370, target:'flora', face:'left', depth:'far' },
    { type:'point', x:96,  y:344, target:'flora', face:'left', depth:'far' },
    { type:'point', x:150, y:371, target:'flora', face:'left', depth:'far' },
    { type:'point', x:283, y:402, target:'flora', face:'left', depth:'far' },
    { type:'line',  x1:88,  y1:639, x2:880, y2:639 },
    { type:'line',  x1:959, y1:423, x2:959, y2:473, face:'left',  depth:'mid', spawn:'midpoint' },
    { type:'line',  x1:1,   y1:483, x2:1,   y2:546, depth:'mid', spawn:'midpoint', face:'right' },
    { type:'line',  x1:236, y1:531, x2:275, y2:531, depth:'mid', spawn:'midpoint' },
    { type:'line',  x1:809, y1:356, x2:809, y2:396, depth:'far', spawn:'midpoint', face:'right' },
    { type:'line',  x1:532, y1:505, x2:576, y2:497, depth:'mid', spawn:'midpoint' },
    { type:'line',  x1:188, y1:419, x2:188, y2:447, target:'fauna', face:'left', depth:'far' },
    { type:'line',  x1:407, y1:462, x2:451, y2:462, target:'fauna', depth:'far' }
  ]},
  meadow3: { anchors: [
    { type:'point', x:150, y:379, target:'flora', depth:'far' },
    { type:'point', x:203, y:370, target:'flora' },
    { type:'point', x:841, y:288, target:'flora' },
    { type:'point', x:877, y:283, target:'flora' },
    { type:'point', x:856, y:378, target:'flora' },
    { type:'point', x:922, y:359, target:'flora' },
    { type:'point', x:901, y:388, target:'flora' },
    { type:'line',  x1:277, y1:637, x2:818, y2:637 },
    { type:'line',  x1:108, y1:638, x2:163, y2:638 },
    { type:'line',  x1:612, y1:550, x2:653, y2:542, depth:'mid', spawn:'midpoint' },
    { type:'line',  x1:958, y1:469, x2:958, y2:560, target:'fauna', face:'left' },
    { type:'line',  x1:2,   y1:307, x2:2,   y2:409, target:'fauna', depth:'far', face:'right' },
    { type:'line',  x1:195, y1:306, x2:228, y2:306, target:'fauna', depth:'far' },
    { type:'line',  x1:635, y1:311, x2:648, y2:330, target:'fauna', face:'right', depth:'far', spawn:'midpoint' },
    { type:'line',  x1:604, y1:316, x2:591, y2:335, target:'fauna', depth:'far', face:'left',  spawn:'midpoint' },
    { type:'line',  x1:26,  y1:269, x2:71,  y2:277, target:'fauna', depth:'far', spawn:'midpoint' },
    { type:'line',  x1:958, y1:239, x2:958, y2:345, target:'fauna', face:'left',  depth:'far', spawn:'midpoint' },
    { type:'line',  x1:220, y1:471, x2:255, y2:471, target:'fauna', face:'left',  depth:'far', spawn:'midpoint' }
  ]},
  cave: { anchors: [
    { type:'point',  x:281, y:434, target:'flora', depth:'mid' },
    { type:'point',  x:716, y:397, target:'flora', depth:'far' },
    { type:'point',  x:630, y:603, target:'flora' },
    { type:'point',  x:656, y:509, target:'flora', depth:'mid' },
    { type:'point',  x:318, y:77,  target:'flora', face:'down', depth:'far' },
    { type:'point',  x:31,  y:123, target:'flora', face:'down', depth:'mid' },
    { type:'point',  x:116, y:541, target:'flora' },
    { type:'point',  x:255, y:615, target:'flora' },
    { type:'point',  x:925, y:554, target:'flora', depth:'mid' },
    { type:'point',  x:645, y:438, target:'flora', depth:'far' },
    { type:'point',  x:852, y:97,  target:'flora', depth:'mid', face:'down' },
    { type:'point',  x:720, y:119, target:'flora', face:'down', depth:'far' },
    { type:'point',  x:282, y:105, target:'flora', face:'down', depth:'far' },
    { type:'region', x:347, y:434, w:254, h:57, target:'flora', depth:'far' },
    { type:'region', x:228, y:496, w:412, h:76, target:'flora', depth:'mid' },
    { type:'region', x:681, y:545, w:160, h:94, target:'flora' },
    { type:'region', x:337, y:579, w:247, h:57, target:'flora' }
  ]},
  cave2: { anchors: [
    { type:'region', x:369, y:466, w:256, h:36, target:'flora', depth:'far' },
    { type:'region', x:260, y:506, w:505, h:85, target:'flora', depth:'mid' },
    { type:'region', x:235, y:592, w:626, h:46, target:'flora' },
    { type:'point',  x:762, y:16,  target:'flora', face:'down', depth:'mid' },
    { type:'point',  x:160, y:585, target:'flora' },
    { type:'point',  x:89,  y:629, target:'flora' },
    { type:'point',  x:33,  y:573, target:'flora', depth:'mid' },
    { type:'point',  x:184, y:494, target:'flora', depth:'far' },
    { type:'point',  x:247, y:492, target:'flora', depth:'far' },
    { type:'point',  x:598, y:107, target:'flora', depth:'far', face:'down' },
    { type:'point',  x:412, y:59,  target:'flora', face:'down', depth:'far' },
    { type:'point',  x:674, y:105, target:'flora', depth:'far', face:'down' },
    { type:'point',  x:253, y:388, target:'flora', depth:'far' },
    { type:'point',  x:770, y:486, target:'flora' },
    { type:'point',  x:676, y:488, target:'flora', depth:'far' },
    { type:'point',  x:905, y:617, target:'flora' },
    { type:'point',  x:915, y:559, target:'flora', depth:'mid' }
  ]}
};
