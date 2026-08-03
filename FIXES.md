# Fixes branch

This branch (`fix/usable`) makes Green Acres work correctly. It is **not** the version that
competed.

| | |
|---|---|
| **Competition version** | branch [`main`](../../tree/main), tagged [`tsa-2025-submission`](../../releases/tag/tsa-2025-submission) |
| **Result** | 1st place, Texas TSA State Conference · Top 16, TSA Nationals (2024–2025) |
| **This branch** | the same project with the bugs fixed |

The submitted version is preserved untouched on `main` and at the tag. Nothing here rewrites
what was judged — check out the tag to run exactly what competed:

```bash
git checkout tsa-2025-submission
```

---

## What was broken

### 0. Every prediction named the wrong crop

This is the big one, and it was invisible: the app kept working and simply gave the wrong answer.

The model was trained with a standard **alphabetical** label encoding — class 0 is `apple`,
class 20 is `rice`, class 21 is `watermelon`. The `allCrops` list in `ai.js` was hand-written in
a different, arbitrary order. Nothing crashes when your label array is permuted; you just print
the wrong name with full confidence.

Verified against the trained model with five profiles taken from the training data:

| Input profile | Model output | Old list showed | Should be |
|---|---|---|---|
| N80 P47 K40, 23.7 °C, 82%, pH 6.4, 236 mm | index 20 (75%) | Watermelons | **Rice** |
| N21 P134 K200, 22.6 °C, 92%, pH 5.9, 113 mm | index 0 (100%) | Moth Beans | **Apples** |
| N101 P28 K30, 25.5 °C, 59%, pH 6.8, 158 mm | index 5 (99%) | Bananas | **Coffee** |
| N117 P46 K20, 24.0 °C, 80%, pH 6.9, 80 mm | index 6 (97%) | Pomegranates | **Cotton** |
| N99 P17 K50, 25.6 °C, 85%, pH 6.5, 51 mm | index 21 (100%) | Pigeon Peas | **Watermelon** |

Five for five, at 97–100% confidence, all matching alphabetical order exactly.

**Fixed:** labels and description files now live in one `CROPS` array in the model's own order,
so the two can't drift apart. `node check_crop_map.js --live` re-runs all five probes against the
running service and fails if the order is ever disturbed again.

### 0b. The climate features were the wrong quantity entirely

`getWeather()` read `hourly.rain[currentHour]` — the rainfall that fell during *one hour*, which
is 0 almost all of the time. The model's rainfall feature ranges over roughly 20–300 mm, which is
a monthly total. Temperature and humidity were single instantaneous readings for the same reason.

For Ames, Iowa the app was sending **0 mm** when the real 30-day total was **194 mm**, and 28.8 °C
/ 51% RH at one moment against 30-day means of 24.5 °C / 80%. Given a desert's worth of rainfall,
the model correctly answered with a dry-climate crop — every location on Earth resolved to
Muskmelon.

**Fixed:** all three are aggregated over a 30-day window — precipitation summed, temperature and
humidity averaged. The panel labels them as such.

| Site | Before | After |
|---|---|---|
| Ames, Iowa | Muskmelons 71% | **Jute 98%**, Rice 2% |
| Punjab, India | Muskmelons 99.9% | **Jute 99.6%**, Maize 0.2% |
| Kerala, India | Muskmelons 100% | **Rice 99.1%**, Coconuts 0.5% |

Kerala returning rice and coconut is the check that matters — those are the two crops the region
is actually known for, and the old code could not distinguish it from Iowa.

### 1. The model was classifying zeros on every cold load

`makeAIRequest()` called `getWeather()` and then read the results from `localStorage` on the
very next line. `getWeather()` is asynchronous — its `fetch` had not resolved yet — so on a
fresh visit `localStorage` was empty and `Number(null)` gave **0**. The model was being asked
which crop grows best at 0 °C, 0% humidity, and 0 mm of rain.

It appeared to work on a reload, because by then the *previous* visit's weather was sitting in
`localStorage`. So the demo looked fine and the predictions were wrong.

**Fixed:** `run()` awaits weather and soil together via `Promise.all` before building the
feature vector.

### 2. Second and third recommendations were array neighbours, not predictions

The old code scanned for the single highest probability, then displayed:

```js
allCrops[ind + 2]   // "another crop that will thrive"
allCrops[ind + 4]
```

Those are the entries two and four positions later in a hand-written list — no relationship to
the model's output. When the top crop landed near the end of the list they were `undefined`,
printing "Another crop that will thrive in your area are undefined."

**Fixed:** the softmax vector is zipped with its labels, sorted by probability, and the top
three are shown with their confidence percentages.

### 3. 16 of 22 crop descriptions returned 404

The description filename was derived by lowercasing the display name and stripping spaces. The
display names are plural and the files are singular:

| Display name | Requested | Actual file |
|---|---|---|
| Bananas | `bananas.txt` | `banana.txt` |
| Rices | `rices.txt` | `rice.txt` |
| Apples | `apples.txt` | `apple.txt` |

Only Moth Beans, Grapes, Cotton, Maize, Kidney Beans and Pigeon Peas happened to line up.

**Fixed:** an explicit `CROP_FILES` map. `node check_crop_map.js` asserts all 22 resolve, so
this can't drift again.

### 4. Soil values were hardcoded, and the panel showed different numbers than it sent

`ai.js` sent `nitrogen: 90, phosphorus: 42, potassium: 43, ph: 6.75` for every location on
Earth. Meanwhile the Soil Quality panel displayed a static table reading pH 5.5, N 5%, P 0.045%,
K 2.5% — different numbers, different units, unrelated to the request. `getSoil()` was an empty
function body.

**Fixed, partially, and honestly:**

- **pH is now real.** [ISRIC SoilGrids](https://rest.isric.org/soilgrids/v2.0/docs) reports pH in
  water at 0–5 cm as `pH*10`, which converts directly to the model's pH feature.
- **N, P and K are grower inputs**, pre-filled with dataset medians that the UI labels as
  estimates. There is no free API for plant-available N/P/K at this resolution, and SoilGrids'
  total nitrogen is in cg/kg while the training data uses kg/ha of *available* nitrogen — there
  is no honest conversion between those two, so this branch doesn't invent one. Anyone with a
  soil test can type their real numbers and hit Recalculate.
- **The panel now displays exactly what was sent**, and states the source of each value.

### 5. The Flask service

- `GET /` called `render_template("ai.html")`, but there is no `templates/` directory, so the
  route raised `TemplateNotFound` on every request. It now serves the static page, and `ai.css`
  / `ai.js` alongside it, so `http://127.0.0.1:5000` works as a real entry point.
- Model paths were bare relative strings, so the service only started if your working directory
  happened to be `frontend/response`. They're anchored to `__file__` now.
- `/predict` wrapped everything in a bare `try/except` and returned the exception text with
  **HTTP 200** — a malformed request looked like a success. Parameters are now validated for
  presence, numeric type, finiteness and plausible range, returning **400** for bad input and
  **500** for genuine failures.
- Added `/health`.

### 6. The map never loaded on the deployed site

`land.html` pulled Leaflet 0.7.3 and `land.js` pulled OSM tiles over plain `http://`. Browsers
block mixed content on an `https` page, so the map was blank on GitHub Pages. Also:

- the identical tile layer was added to the map twice;
- the initial view was `[38.7946, 263.14453]` — longitude 263 is off the map, and should have
  been `263.14 − 360 = −96.86`;
- click coordinates were normalised by hand, wrapping *latitude* to ±180 (latitude only runs to
  ±90) and doing the arithmetic on strings returned by `toFixed()`.

**Fixed:** Leaflet 1.9.4 over `https` with subresource integrity, one tile layer, a correct
centre, and `LatLng.wrap()` for normalisation.

---

## Verification

Everything above was checked against the real model, not reasoned about:

```
OK: 22 classes, files present, order alphabetical
OK    Apples       -> idx  0 Apples       100%
OK    Coffee       -> idx  5 Coffee        99%
OK    Cotton       -> idx  6 Cotton        97%
OK    Rice         -> idx 20 Rice          75%
OK    Watermelon   -> idx 21 Watermelon   100%
OK: label order matches the trained model
```

Validation responses, confirmed live:

| Request | Response |
|---|---|
| missing `rainfall` | `400 missing required parameter: rainfall` |
| `nitrogen=abc` | `400 nitrogen must be a number, got 'abc'` |
| `humidity=999` | `400 humidity must be between 0 and 100, got 999.0` |
| `GET /` | `200` (was `TemplateNotFound`) |

## Still open

- **The model only knows 22 crops, all from an Indian agronomy dataset.** Kerala resolves to rice
  and coconut correctly, but Iowa resolves to jute — wheat, soybean and the other US row crops
  simply aren't classes it can emit. This is a dataset limitation, not a bug in the app, and it
  can't be fixed without retraining on a wider set.
- **SoilGrids has coverage gaps.** It answers 200 with `mean: null` at some points, including
  parts of the US Midwest. The app requests three depths and takes the shallowest with a value,
  then falls back to the dataset default and says which happened.
- The **USDA price panel is static placeholder copy** — three hardcoded prices, no API behind it.
- The **class order should really come from the model**, not a comment. The durable fix is to save
  the label encoder next to the weights at training time and load it in `ai.py`. The live check is
  a guard, not a substitute.
- No test suite beyond `check_crop_map.js`.

---

## Running it

```bash
pip install -r requirements.txt
cd frontend/response
python ai.py
```

Then open <http://127.0.0.1:5000> — the Flask app serves the results page directly now. Set a
location first by opening `frontend/land/land.html` and clicking the map.
