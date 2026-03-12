//////////
// INFO //
//////////

Hello! Thank you for downloading Super Pixel Projectiles Pack 4!
This document contains version history and tips on how to use the included asset packs.

Did you know? You can get access to ALL of my assets if you support me on Patreon!
Check it out: patreon.com/untiedgames

MORE LINKS:
Browse my other assets: untiedgames.itch.io
Watch me make pixel art, games, and more: youtube.com/c/unTiedGamesTV
Follow on Mastodon: mastodon.gamedev.place/@untiedgames
Follow on Facebook: facebook.com/untiedgames
Visit my blog: untiedgames.com
Newsletter signup: untiedgames.com/signup

Thanks, and happy game dev!
- Will

/////////////////////
// VERSION HISTORY //
/////////////////////

Version 1.0 (5/12/25)
	- Initial release. Woohoo!

////////////////////////////////
// HOW TO USE THIS ASSET PACK //
////////////////////////////////

Here are a few pointers to help you navigate and make sense of this zip file.

- In the root folder, you will find folders named PNG and spritesheet.

- The PNG folder contains all the effect animations separated into their own folders, with the frames as individual PNG files.

- The spritesheet folder contains all the effect animations separated into their own folders, but with the frames packed into a single image. A metadata file is alongside each spritesheet which may be used to parse the image.

- Recommended animation FPS: 15 (66.7 ms/frame)

- The laser beam projectiles have three parts:
	Origin: This part is the beginning of the beam.
	Center: The middle of the beam, which spans from the origin to the impact. You can repeat this part horizontally to fill as much space as you need.
	Impact: The part of the beam that's hitting an obstacle.
  Each part of the laser has three animations:
	Start: Used when the beam is just beginning to fire. (Continues seamlessly to loop animation from last frame)
	Loop: Used while the beam is firing. (Continues seamlessly to end animation from last frame)
	End: Used when the beam ceases to fire.
  You can find the animations as folders inside the laser beam folders.

Any questions?
Email me at contact@untiedgames.com and I'll try to answer as best I can!
