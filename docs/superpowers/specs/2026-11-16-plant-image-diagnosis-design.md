# Plant health image diagnosis: design

Date: 2026-11-16. Status: approved 2026-11-16, revised after external review.

## Intent

GrowNex judges plant health from sensors only. This adds a visual judgement from two image
sources, and the means to measure how accurate that judgement is:

- **Zone check**: a coarse "does this zone look healthy" reading from each ESP32-CAM snapshot.
- **Plant diagnosis**: a detailed diagnosis of one plant from a phone close-up.
- **Evaluation**: a repeatable accuracy test of the prompts, for the FYP report.

No model is trained. The engineering contribution is the prompt design, the validated output
contract and the measured accuracy.

## Goals

- A phone close-up of a plant returns: visible symptoms, one condition from a fixed list,
  severity, confidence, likely cause and advice. Results are kept as per-plant history.
- Every camera snapshot gets a visual status. The user is notified when it worsens.
- One script produces accuracy, per-condition precision/recall/F1 and a confusion matrix, and
  can be rerun to compare prompt versions, models, and with/without sensor context.
- Web and mobile show the same results (parity rule in `CLAUDE.md`).
- With AI off or failing, nothing else in the app changes.

## Non-goals

- Training or hosting a model; on-device inference.
- Checking manually uploaded zone snapshots (only camera-node photos are checked).
- Feeding the visual status into `computeZoneStatus` or any automation.
- Web push, per-leaf localisation (bounding boxes), disease progress tracking over time.
- A separate notification preference for visual alerts.

## Anti-goals

- A wrong visual guess must never switch an actuator or change the sensor-based `status`.
- The evaluation must not test a different prompt or code path from the one the app uses.
- No reported accuracy figure for a condition that had no test images.

## Constraints

- Server is the only AI caller; OpenRouter through `services/aiClient.js`; model output is
  untrusted and must be clamped by a validator, like `validatePlan`.
- Firestore Spark budget: the zone check may add at most 3 writes per snapshot (6 snapshots
  per zone per day, so 18 writes).
- ESP32-CAM images are wide and low-resolution: the zone check is coarse by design.
- Security rules are the only tenant isolation; every new path needs a rule.
- Every new collection needs its delete cascades (web, mobile, server account deletion,
  mobile account-deletion fallback).

## Approaches

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | One vision call per image, strict JSON, symptoms listed before the condition is chosen from a fixed list | Cheapest; measurable because the answer is a closed class; reuses the existing AI pipeline |
| B | Two calls: describe symptoms, then diagnose from the description | Reasoning easier to inspect; double cost and latency; A's field ordering gets most of it |
| C | Specialist plant-disease API plus LLM explanation | Likely most accurate; paid black box; leaves no prompt work to evaluate |

The user picked A.

## Output contract

Fixed lists (the evaluation classes). Values outside them are coerced to `unclear`.

**Plant diagnosis** (`validateDiagnosis`):

| Field | Type |
|---|---|
| `observations` | up to 5 short strings, what is visible |
| `condition` | `healthy`, `nutrient_deficiency`, `fungal_disease`, `bacterial_disease`, `viral_disease`, `pest_damage`, `water_stress`, `light_heat_stress`, `unclear`, `not_plant` |
| `severity` | `none`, `mild`, `moderate`, `severe` (`none` forced when healthy/unclear/not_plant) |
| `confidence` | 0 to 1 |
| `likelyCause` | short free text, e.g. "early blight" (not scored) |
| `advice` | up to 4 short strings |
| `summary` | one sentence |

**Zone check** (`validateZoneCheck`): `observations` (up to 4), `status` (`healthy`,
`stressed`, `unhealthy`, `unclear`), `confidence`, `summary`.

## Prompting

One module, `server/src/services/aiVision.js`, holds both prompts, both validators and a
`VISION_PROMPT_V` constant that is stored with every result and printed in every report.

Each system prompt contains, in this order:

1. Role and the image type it will get (close-up, or wide low-resolution zone view).
2. One-line definition of each class, with the visual cues that separate neighbours
   (e.g. fungal spots with rings vs bacterial water-soaked lesions vs uniform yellowing).
3. Rules: judge only what is visible; dark, blurred or plant-free images are `unclear` /
   `not_plant`; sensor context may support a conclusion but never replace visual evidence;
   lower the confidence rather than guess.
4. The JSON shape, with `observations` first so the model describes before it concludes.

The user message carries the image plus a short text context: species, the plant's preferred
ranges, the zone's latest readings, and for the zone check the list of species in the zone.
Context is optional so the evaluation can switch it off.

Calls run at temperature 0. Model comes from `OPENROUTER_VISION_MODEL`, defaulting to
`OPENROUTER_MODEL`.

## Server

- `aiClient.js` `chatJson`: add optional `images` (data URLs sent as image parts),
  `temperature` and `model`. Existing callers unchanged.
- `aiVision.js`: `diagnosePlantImage({ jpeg, context, model })` and
  `checkZoneImage({ jpeg, context, model })`. Both return the validated result plus
  `model` and `promptV`, or throw. **The route, the bridge and the evaluation all call these.**
- `POST /api/ai/plant-diagnosis`, body `{ plantId, diagnosisId }`:
  1. Check the caller owns the plant's zone.
  2. Read the image with the Admin SDK from `plantDiagnoses/{uid}/{diagnosisId}.jpg`. The path
     is built from IDs; a client-supplied URL is never fetched. Reject if missing, over 1.5 MB
     or not a JPEG (`FF D8`), as the camera handler does.
  3. Call `diagnosePlantImage`, write the `plantDiagnoses` doc, return it with `source: 'ai'`.
  4. With AI off or on any error: delete the uploaded image, write nothing, return
     `source: 'fallback'`. There is no rule-based image fallback.
  5. Keep the newest 20 diagnoses per plant; delete older docs and their images.
  6. Refuse more than 30 diagnoses per user per day (count of today's docs), to cap cost.
- Camera path: after `saveZoneSnapshot` in `mqttBridge.js`, call a new
  `checkZoneSnapshot(zoneId, bucketId, jpeg)` without awaiting it. It:
  - merges `visual: { status, observations, summary, confidence, model, promptV, checkedAt }`
    into the snapshot doc;
  - unless the status is `unclear`, updates `zones.visualStatus`, `visualSummary`,
    `visualCheckedAt`;
  - calls `notify()` (type `threshold`, severity `warn`) when the status is worse than the
    stored `zones.visualStatus` and confidence is at least 0.6. A first check never notifies.
  - merges `visualStatus`, `visualConfidence`, `sensorStatus` into that hour of `statsDaily`
    (for the agreement analysis; confirm `flattenDailyStats` on both clients ignores them);
  - Any failure is logged and leaves the snapshot as it is today.

## Data

- `plantDiagnoses/{id}` (top-level, server-written): `{ userId, plantId, zoneId, imageUrl,
  storagePath, createdAt, model, promptV, ...contract fields }`. Clients query
  `userId == uid` and `plantId == x`, and sort by `createdAt` in code (two equality filters
  need no composite index).
- Storage `plantDiagnoses/{uid}/{diagnosisId}.jpg`, uploaded by the client before the call.
- `zones/{id}/snapshots/{bucket}.visual` and `zones.visual*` as above. No new collection.

Rules:

- Firestore `plantDiagnoses`: read and delete if `resource.data.userId == uid()`; no client
  create or update.
- Storage `plantDiagnoses/{uid}/{file}`: read, write if `request.auth.uid == uid`.
- Add a second-user refusal case for both to the integration security-rules test.

Delete cascades (docs and their Storage images):

- Plant delete: web `PlantsTab.jsx`, mobile `plant_detail_screen.dart`.
- Zone delete: web `ZoneDetailPage.jsx`, mobile `zone_detail_screen.dart` (per plant).
- Account delete: `server/src/routes/auth.js` and the mobile fallback in `auth_service.dart`
  (query by `userId`).

## Clients

Same feature on both; follow each side's existing components.

- **Plant detail** (web plant view in `PlantsTab.jsx`, mobile `plant_detail_screen.dart`): a
  "Visual diagnosis" card with
  - a button: mobile "Take photo" (camera or gallery, `image_picker`, max width 1280), web
    "Upload photo" (reuse `downscaleToJpeg`);
  - the latest result: photo, condition as a `StatusLabel`, severity, confidence, symptoms,
    likely cause, advice, time;
  - the history list (newest first), each entry deletable;
  - the line "AI estimate, not a professional diagnosis";
  - on `source: 'fallback'`: "Diagnosis unavailable right now".
- **Zone camera card** (web `CameraCard` in `OverviewTab.jsx`, mobile `_CameraCard`): the
  visual status label and summary under the latest snapshot, with its check time. Hidden when
  the zone has no `visualStatus`.
- Flow: client makes a doc ID, uploads the JPEG to Storage under it, calls the endpoint,
  listens to `plantDiagnoses` for the result.

## Evaluation

`server/eval/visionEval.js`, run by hand, never part of `npm test` (it costs money):

```
node eval/visionEval.js --task plant|zone --split dev|test --dir <images> --labels <labels.csv>
                        [--model <id>] [--provider <name>] [--no-context] [--out <dir>]
node eval/visionEval.js --task agreement [--zone <id>]
node eval/pullSnapshots.js            # save current camera snapshots locally for labelling
```

Protocol (these rules are fixed before any result is looked at):

- **Dev/test split.** `labels.csv` is `file,label,split[,species]`. Prompts, the confidence
  threshold and the model choice are tuned on `dev` only. `test` is run once per final
  configuration and is the only source of reported figures. PlantDoc: a sample of its train
  split is `dev`, its test split is `test`. Own photos: split by plant, so the same plant is
  never on both sides.
- **Label definitions.** `eval/LABELS.md` defines every class with visual cues and tie-break
  rules (e.g. two problems visible: label the dominant one). It is written before labelling
  and uses the same definitions as the prompt.
- **Minimum per class.** A class needs at least 20 test images for its precision/recall to be
  reported. Below that it is listed as "insufficient data (n)". Accuracy carries a 95 % Wilson
  interval.
- **`unclear` rule.** On an image with a real label, `unclear` or `not_plant` counts as a
  wrong answer in the headline accuracy and macro-F1. The report also gives coverage (share
  answered) and accuracy on answered images, as secondary figures.
- **Calibration.** The report bins predictions by confidence (0.1 steps) and shows accuracy
  per bin. The notify threshold (default 0.6) is set from the dev-set table, then checked on
  test. If confidence does not track accuracy, say so and drop the threshold.
- **Pinned model.** Evaluation runs pass a dated model ID and pin the OpenRouter provider with
  fallbacks off. The report records the model and provider returned by the API, the run date,
  the prompt version and the git commit.
- **Same pixels as the app.** Plant images go through the same downscale as the clients
  (longest side 1280 px, JPEG, same quality as `downscaleToJpeg`) before the call, using
  `sharp` as a dev dependency. Zone images are sent raw, as the bridge sends them.

Output: `results.json` (every prediction, confidence, latency, token use) and `report.md`
(the run record above, image count, accuracy with interval, macro-F1, per-class
precision/recall/F1/support, confusion matrix, coverage, calibration table, mean latency).
The metric functions are pure and unit-tested in `server/test/unit.test.js`. Images and
results are gitignored (`server/eval/data/`, `server/eval/out/`). A committed
`eval/plantdoc-map.json` maps PlantDoc class names to the fixed list.

Test sets:

- **Plant**: PlantDoc through the map, plus the user's own labelled close-ups. PlantDoc covers
  mostly healthy, fungal, bacterial, viral and some pest classes; the nutrient, water and
  light classes depend on the user's own photos.
- **Zone**: the user's own ESP32-CAM snapshots, labelled `healthy` / `stressed` / `unhealthy`.
  Snapshots are pruned after 48 h, so `pullSnapshots.js` saves them locally first.

**Camera-vs-sensor agreement** (secondary analysis, needs no labels): each zone check also
records the visual status and the sensor-based `zones.status` of that moment in
`statsDaily/{day}.hours.{HH}` (`visualStatus`, `visualConfidence`, `sensorStatus`), which is
already kept 30 days. `--task agreement` reads those and reports the agreement matrix and
Cohen's kappa, plus a list of disagreements to inspect. It is not the headline: the two
signals measure different things (the environment now, the plant's appearance after days of
it), so disagreement is not error and agreement is not accuracy. Labelled accuracy stays the
main result; this shows what the camera adds that sensors miss.

Experiments for the report, each one rerun of the script: prompt version against prompt
version (dev); two or three models (dev); with and without context (own photos only, PlantDoc
has no sensor data); final configuration once on test.

## Tests

- Unit: `validateDiagnosis`, `validateZoneCheck` (junk in, clamped out), the metric functions
  (accuracy, Wilson interval, per-class scores, kappa, calibration bins, the `unclear` rule).
- Integration (emulators, AI off): the endpoint refuses a plant the caller does not own and
  returns `fallback` without writing; the rules cases above.

## Docs

Update `CLAUDE.md` (data model, cascades, AI section, parity table) and
`server/.env.example` (`OPENROUTER_VISION_MODEL`).

## Left to the builder

- Exact prompt wording and class definitions (expected to change between prompt versions).
- UI layout inside the cards; how history entries collapse.
- Whether the 20 s `aiClient` timeout needs raising for image calls.
- Report formatting.

## Calls made by Claude, not the user

- Top-level `plantDiagnoses` keyed by `userId` (simpler rules and cascades than a plant
  subcollection, and survives a plant moving zones).
- Server writes the diagnosis doc (unlike `automation-plan`, there is nothing to confirm).
- Visual alerts reuse the `threshold` notification type and preference.
- Caps: 20 kept per plant, 30 per user per day; 0.6 confidence to notify is a default to be
  set from the dev-set calibration table.
- Camera-vs-sensor agreement is a secondary analysis, not the main finding (a reviewer
  suggested main; reason given in Evaluation).
- `unclear` zone checks (night, blur) leave `zones.visualStatus` unchanged.
