TRANS-PLANT title menu: everything menu-specific lives under
resources/sprites/interface/menu/ (PMO MENU-002 file organisation).

  menu_overlay.png          the ONE universal room overlay (RGBA, window
                            openings transparent) used over every background
  backgrounds/              interchangeable exterior PNGs, 1536x1024, at the
                            overlay's registration. FOUR ACTIVE, all APPROVED
                            AND LOCKED and in the rotation (MENU-002H):
                              earth.png   Earth (the released master's exterior)
                              mars.png    Mars V3 (V2 with its skylight repaired)
                              ringed.png  Ringed Planet V2-B (V2 + skyfix B)
                              nebula.png  Nebula V1
                            Each is a lossless optimisation of its approved
                            source (hidden pixels zeroed, 8 px margin; the
                            composite is identical). Rejected, kept for
                            comparison as QA-only forced views, never in the
                            rotation, not bundled: mars_v1.png (?view=mars-v1),
                            ringed_v1.png (?view=ringed-v1, MENU-002F1).
  source/                   approved source artwork and what maintains it;
                            nothing here is loaded:
                              menu_overlay_alphafix002a_original.png  the
                                unoptimised overlay (002A alpha fix)
                              mars_v2.png   Mars V2 as supplied (source of V3)
                              mars_v3.png   Mars V3 as approved
                              ringed_v2.png Ringed V2 as supplied (MENU-002F2),
                                the historical source of V2-B
                              ringed_v2_skyfix_b.png  Ringed V2-B as approved
                              nebula_v1.png Nebula V1 as supplied and approved,
                                byte for byte with its C2PA chunk
                              paintings/    the two generated paintings Mars V2
                                and Ringed V2 were registered from (not
                                regenerable; make_mars_v3.py reads the Mars one)
                              provenance/   the PMO intake READMEs, manifests
                                and fit scripts of all five supplied
                                backgrounds, the skyfix measurements, and the
                                optimisation / repair proof records
                              tools/        the repair and optimisation
                                scripts; run from the Trans-plant root, e.g.
                                python resources/sprites/interface/menu/source/tools/optimize_backgrounds.py OUT.json --check
                            The chain from source to runtime file, script by
                            script, is "maintenance" in artwork-manifest.json.
                            Paths inside provenance/ records are historical
                            (the MENU-002 review branches they name are gone).
  code/menu.css             the menu: room box, intro dim, departure fade,
                            the two perspective-mapped displays, poster, motion
  code/menu.js              the menu's behaviour (ruling 113): stages, intro,
                            buttons, SHIP STATUS, departure (window.TITLE_MENU)
  code/background-effects.css  background layers and the effects that belong
                            to one background: the Earth station's three
                            navigation lights (released rules, unchanged);
                            Mars, Ringed and Nebula have no effects of their own
  code/background-views.js  which background is shown and how (window.TITLE_VIEW):
                            one equal-chance draw per page load between the
                            four rotation backgrounds (Earth, Mars, Ringed,
                            Nebula), composited once at 1536x1024 behind the
                            poster and shown in the painting's <img>;
                            ?view=<id>|random; the lights only for a
                            background with that station
  code/artwork-manifest.json  every image, its hash, provenance and status
  menu_leafclear_v1_manifest.json and the five *_leafclear_v1 / window_matte
                            PNGs: the archived MENU-001 art (the master is the
                            source of backgrounds/earth.png; nothing loads it)
  RELEASE_RECORD.txt        the MENU-001 / MENU-002 release history: commits,
                            hashes, QA, deployment, retired branches

Loaded by index.html (link/script tags, in this order: menu.css,
background-effects.css, menu.js, background-views.js). Plain relative URLs
only, so it works from a server and opened from disk (file://).

Exceptions (kept where they are, referenced relatively from menu.css):
  resources/fonts/                      the self-hosted OFL fonts and licences
  resources/sprites/interface/poster-title.jpg   the poster, also used by the
                                        canon demo resources/demo-title.html
  engine/js/screens/records.js          the RECORDS panel (ruling 89), its own
                                        screen, opened from the menu

Rendering (MENU-002C1, PMO approach B): the chosen background and the
overlay are drawn once into a canvas that is never shown, exported as PNG,
and shown in #title-paint; the canvas is freed at once. The poster waits for
it (menu.js, at most 4 s), so the room never shows half-built. Opened from
disk, the overlay and the rotation backgrounds come from the generated bundle
engine/js/portable_data.js as data: URLs (tools/build_portable.js; rebuild
it after changing either), because disk images taint the canvas; over http
that bundle is never loaded. Recovery only: if the export fails, the same pair
shows as two aligned <img> layers; a background that will not load falls back
to Earth. A background joins the rotation (rotation: true) only once the PMO
approves its art, and then also joins tools/build_portable.js.
All four active backgrounds and the overlay are in the bundle, so all four
composite from disk too (Chrome and Firefox, network off); none falls back
to the two-layer path for want of a bundled image.

Rotation (MENU-002H): on every fresh page load background-views.js makes ONE
draw, Math.floor(Math.random() * 4) over Earth, Mars, Ringed, Nebula: each an
equal quarter. The view then stays for the page session: setup's BACK,
RECORDS and idling never redraw or reload it; only a fresh load draws again.
Nothing is stored. There is no player-facing selector.

Background-specific effects: Earth keeps the three station navigation lights
and NEW GAME's "Departure authorised. Mind the station." Mars, Ringed and
Nebula have no station: no lights, and "Departure authorised. Safe travels."
(menu.js reads TITLE_VIEW.station). Poster, CRT power-on, intro, controls,
departure transition and the terminal are the same on every view.

Size and speed (MENU-002H, 960x640; RELEASE_RECORD.txt has the
figures): download per load = overlay 2,074,269 B + one background
952,110-1,029,356 B (2.89-2.96 MiB in all); the portable bundle
engine/js/portable_data.js is 9,722,406 B (from disk only; over http it is
never loaded). The painting is ready about 420-530 ms after navigation
(Chrome, http; Firefox about 480-500 ms); the composite costs ~2-4 ms draw +
~105-160 ms PNG export, behind the poster, the same for every view.

QA switches: ?view=earth|mars|ringed|nebula (the four active views)
?view=mars-v1|ringed-v1 (rejected, comparison only)   ?view=random (a rotation
draw: one of the four, never a rejected view)   ?arch=layers (the recovery path)
Tests: tools/tests/test_title_overlay.js, tools/tests/test_title_menu.js;
tools/tests/menu_rotation_stats.js counts real draws over many loads (not a
run_all battery).
