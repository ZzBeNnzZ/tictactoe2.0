# Animation System Design

**Date:** 2026-04-15  
**Project:** Tic Tac Toe  
**Scope:** Add polished, game-like animations to all interactive elements and page transitions  
**Approach:** Vanilla CSS keyframes + JS class toggling. No external libraries.

---

## Goals

- Polished/game-like feel: springy bounces, staggered entrances, satisfying interactions
- All animations via CSS `@keyframes` + JS class management
- No animation libraries — Web Animations API (`element.animate()`) as fallback if needed
- Respect `prefers-reduced-motion` — all animations off when set

---

## 1. Mode Toggle Transition (Local ↔ Online)

**Behavior:** Slide from side. Direction-aware.
- Local → Online: local panel slides out to left, online panel slides in from right
- Online → Local: online panel slides out to right, local panel slides in from left

**Implementation:**
- Wrap `#local-mode` and `#online-mode` in a `.mode-panels` container with `position: relative; overflow: hidden`
- JS tracks last active mode to determine direction
- On switch: add `slide-out-left`/`slide-out-right` to outgoing, remove `hidden` from incoming, add `slide-in-left`/`slide-in-right`
- On `animationend`: add `hidden` to outgoing, remove animation classes

**CSS keyframes:**
```css
/* slide-out-left: exits to left */
@keyframes slide-out-left { from { transform: translateX(0); opacity: 1; } to { transform: translateX(-60px); opacity: 0; } }
/* slide-out-right: exits to right */
@keyframes slide-out-right { from { transform: translateX(0); opacity: 1; } to { transform: translateX(60px); opacity: 0; } }
/* slide-in-left: enters from left */
@keyframes slide-in-left { from { transform: translateX(-60px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
/* slide-in-right: enters from right */
@keyframes slide-in-right { from { transform: translateX(60px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
```

**Duration:** 300ms, `cubic-bezier(0.34, 1.56, 0.64, 1)` (slight overshoot for game feel)

---

## 2. Lobby Panel Reveal (Create / Join)

**Behavior:** Same slide-from-side system as mode toggle, reusing the same keyframes.
- "Create a Room" active → create panel slides in from left, join panel slides out to right
- "Join a Room" active → join panel slides in from right, create panel slides out to left
- First selection (no active panel): just slide in, no outgoing animation

**Implementation:**
- `#lobby-create-panel` and `#lobby-join-panel` share the same keyframes
- JS tracks currently active lobby panel
- Same `animationend` cleanup pattern as mode toggle

---

## 3. Cell Ripple on Click

**Behavior:** When a mark is placed, a radial ripple expands from cell center and fades out. Color matches player.

**Implementation:**
- JS: on successful cell click, inject `<span class="cell-ripple"></span>` inside the cell
- Ripple gets `style="--ripple-color: <x-color or o-color>"` inline
- On `animationend`: remove the span

**CSS:**
```css
.cell { position: relative; overflow: hidden; } /* already has position: relative */
.cell-ripple {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--ripple-color);
  transform: scale(0);
  opacity: 0.35;
  animation: cell-ripple 400ms ease-out forwards;
  pointer-events: none;
}
@keyframes cell-ripple {
  to { transform: scale(2.5); opacity: 0; }
}
```

---

## 4. Status Message Flip (Scoreboard style)

**Behavior:** When status text changes, it flips on the X axis like a physical departure board card.

**Affected elements:** `#local-status`, `#online-status`, `#lobby-status`

**Implementation:**
- Wrap each status `<p>` content in a `<span class="status-inner">` (added to HTML)
- `setLocalStatus`, `setLobbyStatus`, `setOnlineStatus` updated to use two-phase flip:

Phase 1 (200ms): add `flip-out` → `rotateX(-90deg) opacity 0`
On end: swap `textContent`, remove `flip-out`, add `flip-in`
Phase 2 (200ms): `rotateX(90deg→0deg) opacity 0→1`
On end: remove `flip-in`

- Status elements get `perspective: 400px; transform-style: preserve-3d`
- `transform-origin: center bottom`

**CSS:**
```css
@keyframes flip-out { from { transform: rotateX(0); opacity: 1; } to { transform: rotateX(-90deg); opacity: 0; } }
@keyframes flip-in  { from { transform: rotateX(90deg); opacity: 0; } to { transform: rotateX(0); opacity: 1; } }
```

---

## 5. Board Shake on Win

**Behavior:** When a winner is determined, the board does a short celebratory shake.

**Implementation:**
- JS adds `board-shake` class to `#local-board` or `#online-board` when winner is set
- Class removed on `animationend`

**CSS:**
```css
@keyframes board-shake {
  0%        { transform: translateX(0); }
  15%       { transform: translateX(-8px); }
  30%       { transform: translateX(8px); }
  45%       { transform: translateX(-5px); }
  60%       { transform: translateX(5px); }
  75%       { transform: translateX(-2px); }
  90%       { transform: translateX(2px); }
  100%      { transform: translateX(0); }
}
.board-shake { animation: board-shake 450ms ease-in-out; }
```

---

## 6. Leaderboard Staggered Cascade

**Behavior:** Each leaderboard row slides in from the right with a staggered delay.

**Implementation:**
- `renderOnlineLeaderboard` and `renderLocalStats` set `style="--i: ${index}"` on each row element
- CSS handles delay via `calc(var(--i) * 55ms)`

**CSS:**
```css
.leaderboard-row {
  animation: row-enter 280ms ease-out both;
  animation-delay: calc(var(--i, 0) * 55ms);
}
@keyframes row-enter {
  from { transform: translateX(24px); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}
```

---

## 7. Score Card Slide Indicator

**Behavior:** A colored underline bar slides between X and O score cards to indicate the active turn.

**Implementation:**
- Add `<div class="turn-indicator"></div>` inside `.scoreboard` (HTML change)
- `.scoreboard` gets `position: relative`
- Indicator is `position: absolute; bottom: 0; height: 3px; width: 50%; transition: left 300ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 300ms`
- JS sets `data-active-player="X"` or `"O"` on `.scoreboard`
- CSS selectors position indicator: `[data-active-player="X"] .turn-indicator { left: 0; background: var(--x-color); }` etc.

---

## 8. Supporting Micro-interactions

| Element | Animation | Method |
|---|---|---|
| Room-created-info reveal | Slide down + fade in | CSS class toggle, `max-height` transition |
| Identity status message | Fade in on text set | CSS `fade-in` keyframe on class add |
| Win-pop cells (existing) | Keep, enhance with stagger by distance from first winning cell | JS sets `--cell-dist` var |
| Button `:active` press | `scale(0.94)` | Already in CSS, verify consistent |

---

## 9. Reduced Motion

All animations wrapped in:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Files Changed

| File | Changes |
|---|---|
| `public/styles.css` | All new keyframes, animation classes, indicator styles |
| `public/index.html` | `.status-inner` spans, `.turn-indicator` div, `.mode-panels` wrapper |
| `public/client.js` | Flip logic, ripple injection, shake trigger, stagger index, indicator update |
| `public/app.js` | Local status flip, local board shake, local stagger, mode slide direction |

---

## Out of Scope

- Sound effects
- Particle confetti
- Animated backgrounds
- Loading spinners
