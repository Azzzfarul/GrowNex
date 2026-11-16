# Vision evaluation

Measures the accuracy of the prompts in `src/services/aiVision.js` through the same functions
the app calls. Costs API credit; never part of `npm test`.

## Protocol (fixed before looking at any result)

1. **Dev/test split.** Tune on `dev` only. Run `test` once per final configuration; only test
   figures go in the report.
2. **Labels** follow `LABELS.md`, written before the model's answer is seen.
3. **Minimum per class:** 20 test images, or the class is shown as "insufficient data" / "not
   tested" and left out of macro-F1.
4. **`unclear` rule:** `unclear`, `not_plant` or a failed call on a labelled image is a wrong
   answer in the headline accuracy and macro-F1. Coverage and accuracy-on-answered are secondary.
5. **Calibration:** the report bins answers by stated confidence. Choose
   `VISION_NOTIFY_MIN_CONFIDENCE` from the dev table, then confirm on test. If accuracy does
   not rise with confidence, say so and do not rely on the threshold.
6. **Pinned model:** pass a dated `--model` and a `--provider`. The report records what the API
   says it ran, the date, the prompt version and the git commit.
7. **Same pixels as the app:** plant photos are downscaled exactly as the apps do (1280 px,
   JPEG quality 80). Zone snapshots are sent as the camera produced them.

## Data (gitignored, under `eval/data/`)

- PlantDoc (real-world leaf photos): download it, then
  `node eval/plantdocLabels.js eval/data/plantdoc` writes its `labels.csv` (official test folder
  = test split; first 15 per class of train = dev). Check the dataset's licence before
  publishing images. It has no nutrient, water or light-stress classes.
- Own close-ups: `eval/data/plant/` with a hand-written `labels.csv` (`file,label,split,species`).
- Own camera snapshots: `node eval/pullSnapshots.js` every day or two (they are pruned after
  48 h), then fill in `label` and `split` in `eval/data/zone/labels.csv`. Unlabelled rows are skipped.

## Run order

```bash
npm install                      # sharp is a dev dependency
M=<dated model id>  P=<provider>
node eval/visionEval.js --task plant --split dev --dir eval/data/plantdoc --labels eval/data/plantdoc/labels.csv --model $M --provider $P
# change the prompt → bump VISION_PROMPT_V → rerun dev; compare models the same way
node eval/visionEval.js --task plant --split dev --dir eval/data/plant --labels eval/data/plant/labels.csv --model $M --provider $P --no-context
# final configuration, once:
node eval/visionEval.js --task plant --split test ...
node eval/visionEval.js --task zone  --split test --dir eval/data/zone --labels eval/data/zone/labels.csv --model $M --provider $P
node eval/visionEval.js --task agreement
```

Each run writes `eval/out/<task>-<split>-<time>/report.md` and `results.json`.

## Camera vs sensors (`--task agreement`)

Compares the camera's status with the sensor-based zone status for every hour that has both
(agreement matrix and Cohen's kappa). This is a secondary analysis: sensors measure the
environment now, the camera sees the plant's response after days of it, so disagreement is not
error and agreement is not accuracy. Read the listed disagreements; they show what the camera
adds that the sensors miss, and the reverse.
