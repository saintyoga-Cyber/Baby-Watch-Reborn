# Baby Watch Reborn — Improvement Plan

This is the living planning document for upcoming improvements. It is updated
whenever scope or approach changes, and referred to before any implementation.

## Context

Two improvements are requested for the **Baby Watch Reborn** Pebble app
(`src/c/pebby.c`, a baby-activity tracker with three categories: Bottle = UP,
Diaper = SELECT, Sleep = DOWN):

1. **Feature request (from Appstore user "ProudNarwhal0965"):** Sometimes an
   event happens but isn't logged until later, so the "current time" stamp is
   wrong. They want to **long-press a category** to open a small screen where
   they pick a **negative time offset** (15-minute increments) and log the
   event in the past.

2. **Round Pebble (chalk) UI:** The current layout is three equal rectangular
   bands with a right-side action bar, built with no round-display handling.
   On the 180×180 circular screen this clips at the curved edges and the sleep
   range truncates to `09:18 - ...`.

The app already works and is in production, so these are treated as **two
independent changes**, shipped and committed **separately**.

Per the project's master rules: changes that touch **core functionality**
(event logging) must **not** be bundled with anything else. Change A below is
critical and standalone; Change B is display-only and standalone.

> **Execution gate:** No code is modified until each change is explicitly
> commanded. Implement Change A and Change B as separate commits, each only
> when commanded.

---

## Decisions (confirmed with user)

- **Picker:** 15-minute increments, capped at 12 h (0–720 min). UP increases the
  offset, DOWN decreases, SELECT confirms, BACK cancels.
- **Sleep + offset:** the offset applies to the **current toggle action** — if
  not sleeping, it sets *sleep-start* in the past; if sleeping, it sets
  *sleep-end* in the past. Same logic as today's short-press, just back-dated.
- **Round UI:** **moderate redesign** for chalk (centered-focus feel), not just
  a minimal inset.

---

## Change A — Long-press "log in the past" (CRITICAL · standalone commit)

Touches the event-logging path, so it ships alone.

### A1. Refactor logging into timestamp-driven helpers
Currently the timestamp is captured inside the click handlers
(`time(NULL)` at `pebby.c:178` and `:200`). Extract the logging bodies into
helpers that **accept a `time_t`** so both short-press (now) and the picker
(back-dated) can reuse them:

- `static void logBottle(time_t t)` — body of current bottle path
  (`pebby.c:188-196`): set `bottleStart`, time text, since text, persist, send.
- `static void logDiaper(time_t t)` — body of current diaper path
  (`pebby.c:185-196`).
- `static void toggleSleep(time_t t)` — current `down_single_click_handler`
  body (`pebby.c:202-221`), parameterized on `t`.

Then `up_single_click_handler` / `down_single_click_handler` become thin
wrappers calling these with `time(NULL)`. Reuses existing `setTimeText`,
`setTimeSinceText`, `setTimeRangeText`, `persist_write_int`,
`sendTimelineEvent` — no change to the persist keys or timeline payload.

### A2. Offset-picker window
Add a second window shown on long-press:

- State: `static int pendingCategory;` (Bottle/Diaper/Sleep) and
  `static int pendingOffsetMin;` (0–720, step 15).
- One centered `TextLayer` (reuse the existing font helpers/styling) showing
  the category name and the offset, e.g. `Bottle` / `now`, `15 min ago`,
  `1 h 30 min ago`, up to `12 h ago`.
- Click config for the picker window:
  - UP: `pendingOffsetMin = MIN(pendingOffsetMin + 15, 720)` → refresh label.
  - DOWN: `pendingOffsetMin = MAX(pendingOffsetMin - 15, 0)` → refresh label.
  - SELECT: compute `time_t t = time(NULL) - pendingOffsetMin * 60;` call the
    matching helper from A1 (`logBottle`/`logDiaper`/`toggleSleep`), then
    `window_stack_pop(true)`.
  - BACK: default pop (cancel, logs nothing).

### A3. Long-click subscriptions
In `config_provider` (`pebby.c:225-229`), alongside the existing single-click
subscriptions, add:

```c
window_long_click_subscribe(BUTTON_ID_UP,     0, bottle_long_click_handler, NULL);
window_long_click_subscribe(BUTTON_ID_SELECT, 0, diaper_long_click_handler, NULL);
window_long_click_subscribe(BUTTON_ID_DOWN,   0, sleep_long_click_handler,  NULL);
```

Single-click and long-click coexist on the same button (short press → single
handler on release; held past the default delay → long handler). Each long
handler resets `pendingOffsetMin = 0`, sets `pendingCategory`, and pushes the
picker window. Destroy the picker window/layers on unload to avoid leaks
(mirror `window_unload` at `pebby.c:431`).

**Files:** `src/c/pebby.c` only. No JS/timeline changes (back-dated timestamp
flows through the existing `sendTimelineEvent` unchanged).

---

## Change B — Round (chalk) moderate redesign (display-only · standalone commit)

Branch the layout in `window_load` (`pebby.c:303-428`) with
`PBL_IF_ROUND_ELSE(...)` / `#if defined(PBL_ROUND)`; **leave the rectangular
layout exactly as-is** for aplite/basalt/diorite/emery.

Round-specific layout:

- **Safe area:** inset the content rect with `grect_inset(bounds,
  GEdgeInsets(...))` so band text never lands on the clipped curved edges; the
  `ActionBarLayer` already reserves its (wider, 30px) strip on chalk.
- **Centered-focus bands:** make the **middle band taller / emphasized**
  (larger font, more height) with the top and bottom bands slightly shorter, so
  the round screen reads as a focused center while still showing all three
  categories. Recompute the per-band Y/heights from the inset rect instead of
  the current `bounds.size.h/3` math (`pebby.c:309`, and the hand-tuned
  `5*bounds.size.h/3/2` expressions at `:348,:379`).
- **Fix the `09:18 - ...` truncation:** on round, render the sleep range
  (`timeTextDown`) at a smaller font (e.g. `GOTHIC_18_BOLD`) and/or widen the
  text layer so `HH:MM - HH:MM` fits the narrower circular content width.
  Confirm the `timeTextDown[14]` buffer (`pebby.c:48`) still fits
  `"HH:MM - HH:MM"` (13 chars) — it does; no resize needed.
- Background draw procs (`pebby.c:71-87`) stay rectangular fills; the round
  mask clips them naturally once content is inset.

**Files:** `src/c/pebby.c` only (layout in `window_load`; possibly the bg draw
procs if band shapes change). No logic, persist, or button changes.

---

## Out of scope / noted for later
- No new persist keys, no timeline/JS protocol changes in either change.
- `strncat` usage in `setTimeRangeText` (`pebby.c:144-145`) is currently safe
  for the fixed buffer; not modified here.

## Verification

Pebble project (`package.json` + `wscript`, SDK 3, targets include `chalk`).

1. **Build:** `pebble build` (or `rebble build`) — must compile clean for all
   target platforms in `package.json`.
2. **Change A (logging) — emulator, e.g. basalt:**
   - `pebble install --emulator basalt`
   - Short-press each button → logs at current time (unchanged behavior).
   - Long-press UP → picker opens; UP/DOWN step the offset by 15 min, capped at
     12 h and floored at "now"; SELECT logs and the band shows the back-dated
     `HH:MM` and matching `(N min/h ago)`; BACK cancels with no log.
   - Long-press DOWN while not sleeping sets a back-dated sleep-start; long-press
     again while sleeping sets a back-dated sleep-end; range renders correctly.
   - Relaunch app → back-dated values persist (read back at `pebby.c:391-414`).
3. **Change B (round UI) — chalk emulator:**
   - `pebble install --emulator chalk`
   - All three bands fully visible inside the circle, no edge clipping; middle
     band emphasized; sleep range shows full `HH:MM - HH:MM` with no `...`
     truncation. Capture a screenshot to compare against the reported one.
   - Re-check basalt/aplite to confirm the rectangular layout is unchanged.
