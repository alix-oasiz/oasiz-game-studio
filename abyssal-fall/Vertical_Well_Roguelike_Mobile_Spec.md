# Vertical Well Roguelike – Mobile Technical Specification

## Document Metadata
- Platform: Mobile (Android / iOS PWA)
- Rendering: HTML5 Canvas 2D
- Framework: Vue 3 (Composition API)
- Audience: AI Agent / Game Engineer
- Ambiguity: None

---

## 1. Platform Constraints
- Touch-only input
- 60 FPS target on mid-range mobile devices
- Canvas rendering only (no WebGL)
- Fixed internal resolution: 360x640

---

## 2. Architecture Overview

### Folder Structure
```
/src
 ├─ App.vue
 ├─ main.js
 ├─ engine/
 ├─ entities/
 ├─ systems/
 ├─ render/
 └─ storage/
```

Vue is used only for lifecycle and UI overlays.  
Game loop and logic are framework-agnostic.

---

## 3. Game Loop (Strict Order)
1. InputSystem.update
2. PlayerSystem.update
3. EnemySystem.update
4. WeaponSystem.update
5. Physics.step
6. Collision.resolve
7. ComboSystem.update
8. Camera.update
9. Renderer.draw

---

## 4. Input System (Mobile)

Screen Zones:
- Left 40%: Move Left
- Right 40%: Move Right
- Center 20%: Shoot

Multiple touches allowed.

---

## 5. Player Contract
```
Player {
  x, y,
  vx, vy,
  width, height,
  hp, maxHp,
  ammo, maxAmmo,
  grounded,
  combo,
  comboTimer
}
```

---

## 6. Weapon System
- Downward-only shooting
- Ammo-based
- Shooting applies upward recoil
- Ammo reloads on ground contact or enemy bounce

---

## 7. Enemy System
Enemy Types:
- STATIC
- HORIZONTAL
- CHASER
- EXPLODER
- ARMORED

Collision Rules:
- Top hit: bounce + damage enemy
- Side/bottom hit: player damage

---

## 8. Bounce Mechanic
Conditions:
- Player falling
- Player collides with enemy from above

Effects:
- Enemy damaged
- Player vertical velocity inverted
- Ammo restored
- Combo timer reset

---

## 9. Combo System
- Increments per enemy kill without landing
- Resets on landing, damage, or timer expiry
- Multiplies gem rewards

---

## 10. Level Generation
- Infinite vertical world
- Generated in viewport-sized chunks
- Deterministic RNG seed
- Guaranteed safe path

---

## 11. Shops & Economy
- Currency: Gems
- Shop every N chunks
- Safe zones
- Permanent upgrades per run

---

## 12. Camera
- Follows player downward
- Limited upward movement

---

## 13. Audio
- Web Audio API
- Single AudioContext
- Short procedural sounds

---

## 14. Save System
- localStorage
- Best depth
- Unlocks
- Settings

---

## 15. Fail States
- HP <= 0
- Falling below kill plane

On death:
- Freeze simulation
- Show summary
- Restart option

---

## 16. Prohibitions
- No keyboard/mouse
- No physics engines
- No WebGL
- No Vue reactivity inside loop

---

## 17. Acceptance Criteria
- Stable 60 FPS on mobile
- Responsive touch controls
- Deterministic behavior
- Code matches structure

---

END OF SPEC
