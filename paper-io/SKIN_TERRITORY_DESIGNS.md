# Paper-IO — Skin Territory & Trail Design Guide

Each skin should have a territory fill color, a border/edge accent color, and a surface pattern that matches the animal's real-world appearance. Use these as reference when implementing patterned territory shaders or textures.

---

## Flat Color Skins

| Skin       | Hex       | Territory Fill | Border Accent | Pattern |
|------------|-----------|----------------|---------------|---------|
| Cyan       | `#00E5FF` | Bright cyan    | White         | Solid   |
| Pink       | `#FF3D71` | Hot pink       | Light pink    | Solid   |
| Orange     | `#FFAA00` | Amber orange   | Bright yellow | Solid   |
| Green      | `#00E096` | Mint green     | Lime          | Solid   |
| Purple     | `#A259FF` | Violet         | Lavender      | Solid   |
| Vermillion | `#FF6B35` | Red-orange     | Coral         | Solid   |

---

## Animal Skins — Territory Design Specs

### Cat `#FFAA00` — unlocked by default
- **Fill:** Warm amber/golden-orange
- **Pattern:** Thin dark-brown tabby stripes (`#7A4000`) running diagonally across the territory, spaced ~40px apart
- **Border accent:** Creamy white-orange edge highlight (`#FFE0A0`)
- *Reference: orange tabby cat fur*

---

### Dog `#FF6B35` — unlocked by default
- **Fill:** Sandy burnt-orange
- **Pattern:** Small scattered oval spots in dark brown (`#7B3F00`), ~5–8px wide, randomly placed like a beagle/dalmatian mix
- **Border accent:** Light tan edge (`#FFDAB9`)
- *Reference: golden retriever / beagle coat*

---

### Bunny `#FF3D71` — unlocked by default
- **Fill:** Soft rose pink
- **Pattern:** Subtle lighter pink oval patches (`#FFB6C1`) mimicking fluffy fur tufts — slightly overlapping, soft-edged blobs
- **Border accent:** Pure white edge highlight (`#FFFFFF`)
- *Reference: white/pink rabbit with rosy undertone*

---

### Fox `#FF8C00` — unlocked by default
- **Fill:** Deep burnt orange
- **Pattern:** White triangular wedge pattern (`#FFFFFF`) running inward from the border edge (like a fox's white chest/face blaze); dark brown tips (`#3B1C00`) at the interior center
- **Border accent:** White (`#FFFFFF`)
- *Reference: red fox — orange body, white chest, black leg tips*

---

### Penguin `#4DD0E1` — unlocked by default
- **Fill:** Icy cyan-blue
- **Pattern:** Central white oval patch (`#FFFFFF`) in the middle of the territory (like the penguin's white belly); outer ring stays cyan-blue
- **Border accent:** Black edge (`#111111`)
- *Reference: black-and-white penguin, white front*

---

### Chicken `#FFD700` — unlocked by default
- **Fill:** Bright golden yellow
- **Pattern:** Small white speckles (`#FFFDE0`) scattered randomly across the fill (like feather highlights); occasional tiny red dot cluster at corners (`#CC0000`) representing the comb
- **Border accent:** Orange-red edge (`#FF4500`)
- *Reference: yellow chick / golden hen*

---

### Turtle `#00E096` — unlocks at score 5
- **Fill:** Medium emerald green
- **Pattern:** Hexagonal honeycomb grid in darker green (`#007A50`) covering the territory — like a turtle shell's scute pattern; each hex ~20px
- **Border accent:** Dark olive outline (`#2E5E00`)
- *Reference: turtle shell — hexagonal plates on green background*

---

### Frog `#00E096` — unlocks at score 8
- **Fill:** Bright lime-green
- **Pattern:** Large irregular dark-green blotches (`#1A5C00`) on a lighter green base (`#66FF80`) — like a tree frog's camouflage spots; blotches ~30–60px
- **Border accent:** Yellow-green edge (`#AAFF00`)
- *Reference: green tree frog — bright green with dark irregular patches*

---

### Piglet `#FF9999` — unlocks at score 10
- **Fill:** Light bubblegum pink
- **Pattern:** Slightly darker pink wavy streaks (`#FF6B6B`) running horizontally — mimicking skin folds/creases; subtle, not bold
- **Border accent:** Warm peach edge (`#FFD0B0`)
- *Reference: pink piglet skin with soft fold lines*

---

### Bear `#8B5E3C` — unlocks at score 12
- **Fill:** Medium warm brown
- **Pattern:** Slightly lighter brown fur-stroke lines (`#B8894F`) radiating from center outward in short dashes — like rough bear fur grain
- **Border accent:** Dark chocolate edge (`#3E1A00`)
- *Reference: brown bear — warm mid-brown, darker extremities*

---

### Monkey `#A0522D` — unlocks at score 15
- **Fill:** Sienna brown
- **Pattern:** Large circular lighter-tan patch (`#D2966B`) in the center of territory (mimicking the monkey's face/belly pale area); dark brown outer zone
- **Border accent:** Dark brown edge (`#4A2000`)
- *Reference: brown monkey — darker back, tan face/belly zone*

---

### Mouse `#BBBBBB` — unlocks at score 18
- **Fill:** Light grey
- **Pattern:** Fine parallel silver-grey lines (`#D8D8D8`) running in one direction — like a mouse's short fur grain; very subtle
- **Border accent:** Pale pink edge (`#FFB6C1`) — referencing the pink ears/nose
- *Reference: grey mouse — uniform silver-grey coat, pink accents*

---

### Cow `#F5F5DC` — unlocks at score 20
- **Fill:** Off-white / beige
- **Pattern:** Large irregular black blotches (`#111111`) randomly placed — classic Holstein cow spots; blotches ~50–80px, organic amoeba shapes
- **Border accent:** Black edge (`#111111`)
- *Reference: black-and-white Holstein dairy cow*

---

### Panda `#333333` — unlocks at score 25
- **Fill:** Dark charcoal grey
- **Pattern:** Soft white circular patches (`#FFFFFF`) in the center and corners of territory — like a panda's white body patches; dark grey border zone retained
- **Border accent:** Pure black edge (`#000000`)
- *Reference: giant panda — white body with black eye patches, ears, limbs*

---

### Elephant `#999999` — unlocks at score 30
- **Fill:** Medium blue-grey
- **Pattern:** Large wrinkle lines (`#777777`) in slow-curve arcs across the territory — like elephant skin folds; lines ~3px thick, widely spaced (~50px)
- **Border accent:** Darker grey edge (`#555555`)
- *Reference: elephant skin — grey with deep, wide wrinkle folds*

---

### Parrot `#FF3D71` — unlocks at score 35
- **Fill:** Vibrant hot pink / magenta
- **Pattern:** Diagonal bands of contrasting parrot colors cycling: bright yellow (`#FFD700`), electric blue (`#00A1E4`), and green (`#00CC44`) — like macaw wing stripes; bands ~25px wide at 45°
- **Border accent:** Bright yellow-green edge (`#CCFF00`)
- *Reference: scarlet macaw — red body, yellow + blue + green wing bands*

---

### Crocodile `#2E8B57` — unlocks at score 40
- **Fill:** Deep sea green
- **Pattern:** Rectangular scale grid (`#1A5C30`) — like crocodile scutes; grid lines ~15px apart forming a brick-like pattern, with lighter `#3DB87A` centers in each cell
- **Border accent:** Dark swamp green edge (`#0D3D20`)
- *Reference: crocodile — dark green, armored rectangular scale pattern*

---

### Axolotl `#FFB6C1` — unlocks at score 45
- **Fill:** Soft pastel pink / baby pink
- **Pattern:** Small lavender-pink dots (`#DDA0DD`) scattered evenly — like the spotted pigmentation of a leucistic axolotl; dots ~4–6px
- **Border accent:** Bright pink frills (`#FF69B4`) — referencing the feathery external gills
- *Reference: pink axolotl — pale pink body with lavender speckles, bright pink gill plumes*

---

### Mole `#5C4033` — unlocks at score 50
- **Fill:** Dark earthy brown
- **Pattern:** Fine dark crisscross lines (`#3A2218`) forming a subtle soil/dirt texture — like tunneled earth; lines ~1–2px, tightly spaced (~8px)
- **Border accent:** Clay red-brown edge (`#8B4513`)
- *Reference: mole fur — dark velvety brown; territory evokes dug earth*

---

### Unicorn `#A259FF` — unlocks at score 60
- **Fill:** Vivid violet / purple
- **Pattern:** Diagonal rainbow shimmer bands cycling through: pink (`#FF6EB4`), violet (`#A259FF`), blue (`#4FC3FF`), and gold (`#FFD700`) — like iridescent unicorn mane; bands ~30px at 45°, semi-transparent overlay
- **Border accent:** Sparkling gold edge (`#FFD700`)
- *Reference: mythical unicorn — rainbow mane, shimmering magical aura*

---

## Usage Notes

- **Territory fill** = the base color of the claimed area mesh (already set as `color` in `SkinDef`)
- **Border accent** = the raised beveled edge tint at the territory boundary
- **Pattern** = a texture/shader applied on top of the fill within the territory
- All patterns should tile seamlessly and remain readable at the camera's zoom level (~20 units above the board)
- Pattern lines/dots should be 2–4× larger than they appear at full zoom (account for the perspective camera foreshortening at the top of the screen)
