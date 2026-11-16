# Labelling guide

Write the label **before** looking at what the model says. These definitions are the same ones
the prompt uses (`CONDITION_DEFS` in `src/services/aiVision.js`); change both together and bump
`VISION_PROMPT_V`.

## Plant close-ups (`--task plant`)

| Label | Use when the photo shows |
|---|---|
| `healthy` | No visible problem. Old lower leaves yellowing alone, or small mechanical tears, are still healthy. |
| `nutrient_deficiency` | Patterned discolouration tied to leaf age or veins: older leaves uniformly yellow, yellow between green veins, purple or bronze tints, pale new growth. No distinct spots or mould. |
| `fungal_disease` | Discrete spots or lesions (often ringed or with a yellow halo), powdery white or grey coating, rust pustules, fuzzy mould, dark sunken patches. Also late blight and downy mildew (fungus-like organisms): large, fast-spreading dark or water-soaked patches that cross veins, or angular yellow patches, either with pale or grey-purple fuzzy growth underneath. |
| `bacterial_disease` | Small water-soaked, greasy or translucent lesions, often angular and stopped by veins, sometimes with a yellow halo or ooze, never with fuzzy growth; soft wet rot. |
| `viral_disease` | Mosaic or mottled light/dark patterning, curling, puckering, distorted or stunted new growth, with no spots or mould. |
| `pest_damage` | Insects, mites, eggs or webbing in view; chewed holes, leaf-miner trails, fine pale stippling, sticky residue. |
| `water_stress` | Whole-plant wilting or drooping; crispy brown edges and tips (under-watering); limp yellow leaves with soft dark stems and wet soil (over-watering). |
| `light_heat_stress` | Bleached or tan scorched patches on the most exposed leaves; or pale, stretched, leggy growth. |

`unclear` and `not_plant` are answers the model may give. They are never labels: do not put a
photo in the set unless a person can tell what it shows.

Rules:

1. **Label the cause you know, not the look.** If you caused the problem (stopped watering,
   moved it into full sun), that is the label, even when it resembles another class.
2. **Two problems visible:** label the one covering more of the plant. If you cannot decide,
   leave the photo out.
3. **Cannot tell after 10 seconds:** leave the photo out. Record how many you left out.
4. One row per photo; several photos of one plant are fine but see the split rule.

## Zone camera snapshots (`--task zone`)

| Label | Use when the snapshot shows |
|---|---|
| `healthy` | Plants upright, foliage mostly green and full. |
| `stressed` | Some drooping or wilting, or noticeable yellow or brown areas, most foliage still alive. |
| `unhealthy` | Widespread collapse, heavy browning or yellowing, bare or dead plants. |

Label from what you saw in person at that time, not only from the image. Leave out snapshots
that are too dark to see anything (count them; the model should answer `unclear` on those, which
you can check separately).

## Splits

- `dev`: used while changing prompts, picking the model and setting the confidence threshold.
- `test`: run once per final configuration. Never change anything after looking at a test result
  and then report that result.
- Own photos: split **by plant** (and for the zone set, by day), so the same plant or the same
  afternoon is never on both sides. Aim for about one third dev, two thirds test.
- A class needs at least 20 test images to get a reported precision and recall.
