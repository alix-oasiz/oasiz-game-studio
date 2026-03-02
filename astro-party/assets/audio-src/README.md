Place raw audio source files in this folder, then run:

- `bun run ffmpeg:install` (one-time per machine/repo clone, installs local binary into `.tools/ffmpeg`)
- `bun run ffmpeg:check` (optional verification)
- `bun run process:audio`

The script reads expected output filenames from `src/audio/assetManifest.ts` and converts
matching source files into `public/assets/audio` using `ffmpeg`.

Current output format:
- `.ogg` using Vorbis (`libvorbis`) at high quality (`-q:a 7`), 44.1kHz stereo

Source matching rules:
- Exact path match: `assets/audio-src/<relativePath from manifest>`
- Fallback match: same basename with a supported extension (`.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a`, `.aif`, `.aiff`)

Useful options:
- `bun run process:audio -- --dry-run`
- `bun run process:audio -- --src path/to/raw-audio`
- `bun run process:audio -- --out public/assets/audio`
- `bun run process:audio -- --ffmpeg-bin ffmpeg`
- `bun run process:audio -- --only sfxFight`
- `bun run process:audio -- --only sfx-fight.ogg`
- `bun run process:audio -- --only sfx-fight.ogg,sfx-fire.ogg`

FFmpeg resolution order:
- `--ffmpeg-bin <path>`
- `FFMPEG_BIN` or `FFMPEG_PATH`
- local `.tools/ffmpeg/ffmpeg` (or `.exe` on Windows)
- `ffmpeg` from system `PATH`

Expected output filenames in `public/assets/audio`:
- music-cue-splash.ogg
- music-cue-logo.ogg
- music-loop-menu.ogg
- music-loop-gameplay.ogg
- music-cue-results.ogg
- sfx-fire.ogg
- sfx-explosion.ogg
- sfx-hit.ogg
- sfx-hit-soft.ogg
- sfx-dash.ogg
- sfx-countdown.ogg
- sfx-fight.ogg
- sfx-win.ogg
- sfx-kill.ogg
- sfx-respawn.ogg
- sfx-powerup.ogg
- sfx-ui-click.ogg
- sfx-pilot-eject.ogg
- sfx-pilot-death.ogg

Prompt-based rename key (2026-02-26):
- `Arcade_sci-fi_plasma_#2-1772054061754.wav` -> `sfx-fire-previous.wav`
- `Arcade_elimination_c_#2-1772054216646.wav` -> `sfx-kill.wav`
- `Competitive_match_co_#1-1772054288964.wav` -> `sfx-countdown.wav`
- `clear_fight_fx_that__#1-1772053805351.wav` -> `sfx-fight-2.wav`
- `Small_character_defe_#3-1772054391047.wav` -> `sfx-pilot-death.wav`
- `Respawn_materialize__#3-1772054527954.wav` -> `sfx-respawn.wav`
- `Projectile_impact_pi_#2-1772054621694.wav` -> `sfx-hit.wav`
- `Neon_holographic_UI__#2-1772054956378.wav` -> `sfx-ui-click-previous.wav`
- `sound (1).wav` -> `sfx-explosion.wav`

Fight variants:
- `clear_fight_fx_that__#4-1772053786795_trim-v1.wav` -> `sfx-fight.wav` (active, longer trimmed variant)
- `clear_fight_fx_that__#4-1772053786795_trim-v2.wav` (alternate shorter trim)
- `clear_fight_fx_that__#4-1772053786795.wav` (original untrimmed source)

UI click variants:
- `sound (3).wav` -> `sfx-ui-click.wav` (active)
- `sfx-ui-click-pre-sound3-v1.wav` (backup of previous active before sound(3) swap)
- `sfx-ui-click-fast-1p6x-tight.wav` -> `sfx-ui-click.wav` (previous active)
- `sfx-ui-click-previous.wav` (previous active source)
- Additional alternates: `sfx-ui-click-fast-1p2x.wav`, `sfx-ui-click-fast-1p3x.wav`, `sfx-ui-click-fast-1p4x-tight.wav`, `sfx-ui-click-fast-1p5x.wav`, `sfx-ui-click-fast-1p8x-tight.wav`, `sfx-ui-click-fast-2p0x-tight.wav`

Countdown variants:
- `sfx-countdown.wav` (active, tail-noise-trimmed)
- `sfx-countdown-pre-tailfix-v1.wav` (backup of previous active before tail cleanup)

Dash variants from `jump.wav` (toned down):
- `sfx-dash-from-jump-v4-soft-270ms.wav` -> `sfx-dash.wav` (active, longest/most blended)
- `sfx-dash-from-jump-v1-soft-180ms.wav` (fastest/tightest)
- `sfx-dash-from-jump-v2-soft-220ms.wav` (balanced)
- `sfx-dash-from-jump-v3-soft-250ms.wav` (smoother tail)

Fire variants:
- `sfx-fire.wav` (active, mix-v1 toned projectile cue)
- `sfx-fire-pre-mix-v1.wav` (backup of previous active before mix-v1 retune)
- `sfx-fire-v1-crisp-240ms.wav` -> `sfx-fire.wav` (previous active)
- `sfx-fire-previous.wav` (previous active source)
- Additional alternates: `sfx-fire-v2-balanced-300ms.wav`, `sfx-fire-v3-soft-tail-360ms.wav`, `sfx-fire-v4-fuller-420ms.wav`

Hit variants:
- `sfx-hit.wav` -> `sfx-hit.ogg` (active, original asteroid hit)
- `sfx-hit-soft.wav` -> `sfx-hit-soft.ogg` (active for yellow blocks)
- `sfx-hit-soft-pre-mix-v1.wav` (backup of previous yellow-block soft hit before mix-v1 retune)

Powerup variants:
- `pickupCoin (2).wav` -> `sfx-powerup.wav` -> `sfx-powerup.ogg` (active)
