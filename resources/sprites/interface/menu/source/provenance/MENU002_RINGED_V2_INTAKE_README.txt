TRANS-PLANT — MENU-002 — RINGED PLANET V2 ARTWORK CANDIDATE
PMO artwork handoff, not approved final art

BRANCH BASELINE
Use published review branch agent/transplant-menu-002f1-ringed-review
Base SHA 93c992dafca34742f9bfdbb55390b798c84d6024
Production main 59779817ec165a96338ade6e08362545b58377a0 remains untouched.

DELIVERABLE
MENU002_RINGED_V2_REGISTERED_CANDIDATE_1536x1024.png
Opaque RGB 1536x1024. Exterior-only. This is a new candidate; it supersedes
rejected V1 for review but does not imply visual approval.

SOURCE AND FIT
wide_cinematic_space_scene_high_detail_sci_fi_ast.png is the unmodified
image-generated illustrated source (1536x1024 RGB).
The fit is 0.70x uniformly (Lanczos), offset +330 px X and +57 px Y. A
full-canvas source-based background and feathered registration margins were
used to avoid empty exposed space. The fitted image is 1536x1024 RGB.
The fitting tool is make_ringed_v2_fit.py. It is reproducible as packaged.

PMO ART CONSTRAINTS
- ONE existing universal menu_overlay.png used without changes.
- No new room, console, vegetation, frame, text or humanoid content.
- No Earth/Mars changes; preserve default rotation Earth/Mars only.
- First intake under forced ?view=ringed with rotation=false, station=false.
- Do not add ringed to the offline portable bundle before art approval.
- Compare with reference Earth/Mars in Chrome and Firefox.
- Review skylights and image joins, especially top y0-130, right x1300+, and
  lower window/rail near y690-740. Prior Mars V2 mirror defect must not recur.
- Pay attention to any original-source stars, ring arc or celestial details
  reappearing in exposed margins from the fitted art. If visible, FAIL and
  report exact source coordinates. Do not conceal with blur.
- Measure actual planet center/radius, rings visible, ellipse opening and
  curvature, sun location, shadows and color vs V1 through the REAL overlay.
- Do not silently rescale, crop or repaint candidate in implementation.

ARTIST'S COMP TARGET (not a claim that this draft is exact)
Planet: center near (880, 405), radius ~185-200 px.
Ring: span ~1040, tilt -15 to -20 deg, ellipse height ~230-260 px,
inner edge 0.62-0.70 of outer; centered on planet.
Sun: near (1264,130), compact and hidden by vines; cooler left sky.
Ring shadows and near/far intersections must be coherent.

NOT YET AUTHORISED
Production merge, deploy, default rotation addition, code changes outside
art intake. This is a PMO VISUAL REVIEW asset only.
