# Paper.io 3D — Progress

## Architecture
- **Free-form polygon territory** (not grid-based)
- **Continuous smooth movement** with 4-direction controls
- **Camera follows player** with smooth lerp
- **Line-segment intersection** for trail collision
- **Polygon capture** when trail loop closes back to territory

## Completed
- [x] `constants.ts` — Map size, speed, colors, spawns, Vec2 helpers
- [x] `Collision.ts` — Segment intersection, point-in-polygon, polygon area, spatial helpers
- [x] `Territory.ts` — Multi-polygon territory with capture, overlap removal, area calc
- [x] `Player.ts` — Continuous movement, trail sampling, input handling (keyboard/touch/dpad)
- [x] `Bot.ts` — AI with EXPAND/RETURN_HOME/FLEE states, waypoint steering
- [x] `Renderer.ts` — Three.js scene, ShapeGeometry territories, line trails, avatar follow camera
- [x] `Game.ts` — Frame-based game loop, collision detection, territory capture, death effects
- [x] `ParticleSystem.ts` — Death burst tetrahedra particles
- [x] `Audio.ts` — Web Audio API synthesized sounds
- [x] `HUD.ts` — Leaderboard, timer, territory % (polygon area based)
- [x] `Menu.ts` — Main menu, game over screen, pause overlay
- [x] `index.html` — Full UI layout with CSS
- [x] TypeScript compiles clean

## File Structure
```
src/
├── main.ts          — Entry point
├── Game.ts          — Main game loop
├── constants.ts     — Config, enums, Vec2 helpers
├── Collision.ts     — Geometry/collision utilities
├── Territory.ts     — Polygon territory system
├── Player.ts        — Player state + input
├── Bot.ts           — Bot AI controller
├── Renderer.ts      — Three.js rendering
├── ParticleSystem.ts — Death effects
├── Audio.ts         — Sound synthesis
├── HUD.ts           — DOM overlay HUD
└── Menu.ts          — Menu screens
```

## Known Issues / TODO
- [ ] Territory polygon union could be more robust (currently keeps separate polygons)
- [ ] Trail rendered as thin line — could be a ribbon/tube for better visibility
- [ ] Bot pathfinding could be smarter about avoiding trails
- [ ] No win condition screen (only game over on death)
