# Project Specification: Astro Party Clone

**Gameplay Vidoe** https://www.youtube.com/watch?v=ekwammtv2Ac

## 1. Game Overview
**Astro Party** is a 2-4 player top-down arena shooter. The objective is not to destroy ships, but to eliminate the **Pilots** that survive the ship's destruction. The game relies on high-inertia physics, rapid rounds, and randomized map elements.

**Exploratory Direction:** The game feel remains **Astro Party**, but the default map is larger and exploratory (inspired by io games). Players should spawn far apart and not immediately see each other at match start. Obstacles and map features create exploration space.

## 2. Input & Control Scheme
The game uses a **two-button control scheme** for each player corner.

### 2.1. Button Mapping
*   **Button A (Rotation & Dash):**
    *   **Hold:** Rotates the ship clockwise at a constant speed.
    *   **Release:** Stops rotation.
    *   **Double Tap:** Triggers **Super Dash**. The ship performs a sudden, short-range burst of speed in its current facing direction. This overrides current momentum.
*   **Button B (Thrust & Fire):**
    *   **Hold:** Fires the primary weapon (fixed fire rate) AND applies forward thrust simultaneously.
    *   **Note:** You cannot shoot without moving forward, and you cannot move forward without shooting (unless using the Super Dash).

### 2.2. Ship Physics
*   **Zero-G Inertia:** Ships drift significantly. Releasing Button B does not stop the ship; it continues gliding on its vector, slowed only by minor drag.
*   **Bounce:** Ships collide elastically with the arena bounds (walls) and indestructible map objects.
*   **Recoil:** Firing a projectile imparts a negligible but non-zero reverse force.

---

## 3. Core Loop & Scoring Mechanics

### 3.1. The "Pilot Hunter" Cycle
1.  **Ship Phase:** Players dogfight. A single hit from a laser, asteroid, or hazard destroys a ship.
2.  **Ejection Phase:** When a ship is destroyed, it explodes and ejects a **Pilot** (a small human sprite).
    *   The Pilot retains some momentum from the ship (ragdoll trajectory) before friction slows them down.
    *   The Pilot can run slowly on their own (AI controlled behavior: run away from threats or drift aimlessly).
3.  **The Kill:** A point is **only** awarded if a player destroys an ejected Pilot.
    *   *Methods:* Shooting the pilot or crushing them with a ship/asteroid.
    *   *Scoring:* +1 to the killer's score track.
4.  **Regeneration (The Rescue):**
    *   If a Pilot survives for a set duration (approx. 5 seconds), they are "rescued."
    *   The Pilot sprite flashes/fades out.
    *   The player immediately respawns in a new ship at a random safe spawn point.
    *   **No points** are awarded to anyone if the pilot regenerates.

### 3.2. Win Condition (The Track)
*   The scoreboard is a UI race track overlay.
*   Each "Kill" moves the player's ship icon one step forward.
*   First to reach the finish line (Standard: 5 kills) wins.

### 3.3. Sudden Death / Overtime
If no kills occur for a set duration:
1.  **"OVERTIME"** text flashes.
2.  **The Crush:** Indestructible blocks begin spawning from the outer edges of the map, slowly filling the screen row by row, reducing the playable area until someone is crushed.

### 3.4. Round Structure (Online Multiplayer)
**Player Death Handling (During an Active Round):** When a player’s Pilot is killed, they are marked **Eliminated** for the current round and enter **Spectator Mode**. Spectators can watch, cannot interact with gameplay, and may exit the game session at any time.

**Last Player Check:** After any elimination, check remaining active players. If only one remains, declare them **Round Winner**, increment their score (**score++**), end the round, and start the next round after a short delay. If more than one remains, continue the round and keep eliminated players as spectators until the round ends.

### 3.5. Round Transition (Session Progression)
Clear all active ships, pilots, and projectiles. Reset map state. Respawn all non-exited players. Start the next round using the same session rules.

### 3.6. Game Session End Condition
A session ends when one player reaches the defined win condition (e.g., first to 3 kills). At session end, declare one **Winner**, mark all other players as **Losers**, freeze gameplay, and display the **End Session UI**.

### 3.7. End Session UI
Show the following buttons: **Restart**, **Main Menu**.

### 3.8. Local Match Scenario (Input & Session Flow)
Replace local multiplayer with **Single-Player**:
*   Single-player uses the same core loop, but the player competes against AI-controlled ships.
*   The game should support **bots** to fill missing player slots in online multiplayer.
*   AI should be rudimentary and use the same input rules as players (rotation, thrust/fire, dash).
*   Session flow remains the same (rounds, elimination, score track, end session UI).

---

## 4. Game Entities

### 4.1. The Ships
*   **Hitbox:** Triangular.
*   **Attributes:** High inertia, continuous rotation.
*   **State:** Alive (Active), Destroyed (Pilot Ejected).

### 4.2. Destructible Objects
*   **Yellow Blocks:** Grid-aligned barriers. They block movement and lasers. Destroyed by 1 shot.
*   **Orange Asteroids:** Large, floating rocks with random trajectories.
    *   *Interaction:* Destroyed by 1 shot.
    *   *Loot Table:* Upon destruction, they may spawn a **Power-Up** bubble or nothing.
*   **Debris:** Small space junk (grey rocks/scrap).
    *   *Interaction:* Blocks movement/shots. Destroyed by 1 shot. Purely obstructional; drops no loot.

### 4.3. Indestructible Objects (Map Features)
*   **Border Walls:** Screen edges (unless "Loop" feature is active).
*   **Hard Blocks:** Metal/Grey blocks that cannot be destroyed (often used for the "Hideout" or "Turret" bases).

---

## 5. Map System
*Note: Maps are not strictly hardcoded "levels" but rather randomized arrangements of specific features. The reverse-engineered project should be able to generate maps containing one or more of the following archetypes:*

**Map Scale & Exploration Requirements (Core):**
*   Default map is **large and exploratory** compared to the original Astro Party arena.
*   Players should **spawn far apart** and **not immediately see each other** at match start.
*   Map should include **obstacles** and **exploration space** to encourage movement and discovery.
*   Provide **2-3 map size variants**.
*   **Small:** Similar to Astro Party scale (fast, no exploration).
*   **Large:** Exploratory (default).
*   **Medium (optional):** Middle ground between fast arena and exploration.
*   Round pacing is longer by default on large maps to accommodate exploration.

**Spawn & Visibility (Core):**
*   **Safe spawn** requires a minimum distance from any active ship, pilot, or hazard.
*   Spawn points must avoid immediate line-of-fire from turrets or hazards.
*   Visibility should be limited by distance on large maps to reinforce exploration. Players outside the radius are not shown on HUD.

1.  **The Void:** Empty arena. Only players.
2.  **The Cache:** High density of Destructible Yellow Blocks and Orange Asteroids.
3.  **The Turret:** A neutral, invincible turret placed in the center. It rotates and fires standard projectiles at the nearest player.
4.  **Laser Beams:** Two moving emitters (either rotating or sliding along walls) create a lethal laser beam connection between them. Players must dash through or fly around the beam.
5.  **Repulse/Attract:** Large circular gravity wells.
    *   *Orange:* Pushes ships away.
    *   *Blue/Green:* Sucks ships in.
6.  **Loop:** Screen borders are disabled. Flying off the right wraps to the left.
7.  **Hideout:** Clusters of indestructible blocks that act as visual cover. Ships inside are obscured from enemies.
8.  **Large Obstacle (Moon-like):** A massive central circular object that blocks all fire and movement, forcing players to orbit it to fight.

---

## 6. Power-Ups
Power-ups appear in floating bubbles. They are collected by shooting the bubble or ramming it.

*   **Scatter Shot:** Fires 3 projectiles in a cone spread.
*   **Laser Beam:** A continuous hit-scan beam. Instantly destroys ships and penetrates through multiple soft blocks (Yellow blocks/Asteroids).
*   **Homing Missiles:** Fires projectiles that adjust their trajectory to track the nearest living enemy ship.
*   **Proximity Mine:** Drops a stationary, flashing mine from the rear of the ship. Explodes on contact with a ship or pilot.
*   **Joust:** Spawns two **Green Energy Layers** on the left and right flanks of the ship.
    *   *Function:* Acts as side-armor (blocking bullets from the side) and widens the ship's hitbox, allowing the player to "sideswipe" enemies to destroy them.
*   **Reverse All:** Global status effect. Inverts the rotation (Button A) for all players for a short duration.

---

## 7. Menu & Setup Logic

### 7.1. Pilot Selection (Lobby)
*   Four corners of the screen display "Join" prompts.
*   **Toggles:** Tapping the button cycles through:
    1.  **Player (1P, 2P, etc.)** - Active human player.
    2.  **OFF** - Slot is empty.
*   *Correction:* There is no AI/CPU toggle in the selection screen.

### 7.2. Matchmaking Rules Summary
*   **Minimum players required:** 1 (bots fill remaining slots).
*   **Maximum players allowed:** 4.
*   **Session starts only when:** `playerCount ≥ 1` and all active players are ready.
*   **If `playerCount < 1`:** Display warning: **"Player count is too low. Invite a friend or return to Main Menu."**

### 7.3. Settings (Advanced Setup)
Toggle switches to customize the engine:
*   **Asteroids:** Quantity slider (None -> Many).
*   **Auto-Balance:** Dynamic difficulty (Losing players get better power-ups).
*   **Powerups:** On/Off master switch.
*   **Fixed Spawn:** Ships spawn in corners vs. Random locations.
*   **Friendly Fire:** On/Off.
*   **Super Dash:** On/Off (Enables the double-tap Button A mechanic).

### 7.4. Restart Flow (Session Reset)
**On Restart button click:** Create a new game session, preserve currently connected players, and enter Matchmaking Ready State. **Player count handling:** Required minimum players is 1. If connected players ≥ 1, wait for all players to confirm ready and start a new session automatically. If connected players < 1, show message: **"Not enough players. Invite someone to play or return to Main Menu."**

### 7.5. Main Menu Flow
**On Main Menu button click:** Remove the player from the current session, reduce the active matchmaking player count, and keep remaining players in matchmaking. **Example:** 4 players finish a session. 1 player goes to Main Menu. 3 players press Restart. New matchmaking waits for 3 players to be ready. Session starts once all ready.

---

## 8. Technical Asset Requirements (For Reverse Engineering)

### 8.1. Visual Feedback
*   **Screen Shake:** Global camera offset must shake violently on ship death.
*   **Particles:**
    *   *Thrust:* Stream of particles opposite to movement.
    *   *Explosion:* 360-degree burst of pixel particles matching ship color.
    *   *Debris:* Grey/Yellow chunks when blocks/asteroids break.

### 8.2. Audio Cues
*   **Thrust:** Looping noise while Button B is held.
*   **Laser:** High pitch "pew".
*   **Explosion:** Bit-crushed noise.
*   **Announcer:** Arcade-style voice lines for major events ("FIGHT", "OVERTIME", "PLAYER 1 WINS").

## 9. Game States

| State | Description |
| --- | --- |
| Active | Playing current round |
| Eliminated | Dead, spectating |
| Ready | Waiting for session start |
| Disconnected | Left the session |
| Menu | Returned to Main Menu |
