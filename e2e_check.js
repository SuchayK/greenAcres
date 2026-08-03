// End-to-end check of the data pipeline, mirroring what ai.js does in the
// browser: SoilGrids -> Open-Meteo -> /predict -> ranked crops -> description
// file. Run with `node e2e_check.js` while `python ai.py` is running.
//
// This is not a substitute for opening the page, but it exercises every network
// hop and the label/description lookup with real coordinates.

const fs = require("fs");
const path = require("path");

const API = "http://127.0.0.1:5000";
const SITES = [
  { name: "Ames, Iowa", lat: 42.03, lon: -93.62 },
  { name: "Punjab, India", lat: 30.9, lon: 75.85 },
  { name: "Kerala, India", lat: 10.85, lon: 76.27 },
];

const src = fs.readFileSync(path.join("frontend", "response", "ai.js"), "utf8");
const CROPS = [];
{
  const block = src.match(/const CROPS = \[([\s\S]*?)\n\];/)[1];
  const re = /display:\s*'([^']+)',\s*file:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(block)) !== null) CROPS.push({ display: m[1], file: m[2] });
}

const WINDOW_DAYS = 30;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => sum(a) / a.length;

async function weather(lat, lon) {
  const r = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=precipitation_sum,temperature_2m_mean&hourly=relative_humidity_2m` +
    `&past_days=${WINDOW_DAYS}&forecast_days=1&timezone=UTC`
  );
  const d = await r.json();
  return {
    temperature: +mean(d.daily.temperature_2m_mean.filter(isNum)).toFixed(2),
    humidity: +mean(d.hourly.relative_humidity_2m.filter(isNum)).toFixed(2),
    rainfall: +sum(d.daily.precipitation_sum.filter(isNum)).toFixed(2),
  };
}

async function soilPh(lat, lon) {
  const r = await fetch(
    `https://rest.isric.org/soilgrids/v2.0/properties/query` +
    `?lon=${lon}&lat=${lat}&property=phh2o` +
    `&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`
  );
  const d = await r.json();
  const hit = (d.properties.layers[0].depths || []).find(
    (x) => x.values && isNum(x.values.mean)
  );
  return hit ? hit.values.mean / 10 : null;
}

(async () => {
  let failures = 0;

  for (const site of SITES) {
    process.stdout.write(`\n${site.name}\n`);
    const [w, ph] = await Promise.all([weather(site.lat, site.lon), soilPh(site.lat, site.lon)]);

    console.log(`  climate   ${w.temperature} C mean, ${w.humidity}% RH mean, ${w.rainfall} mm total (${WINDOW_DAYS}d)`);
    console.log(`  soil pH   ${ph === null ? "no SoilGrids coverage here — falls back to default" : ph + "  [SoilGrids]"}`);

    // A null pH is a legitimate SoilGrids coverage gap, not a failure; the app
    // falls back to the dataset default and says so.
    if (!isNum(w.rainfall) || !isNum(w.temperature) || !isNum(w.humidity)) {
      console.log("  FAIL: climate features are not all numbers");
      failures++;
    }

    const q = new URLSearchParams({
      nitrogen: 90, phosphorus: 42, potassium: 43,
      temperature: w.temperature, humidity: w.humidity,
      ph: ph ?? 6.75, rainfall: w.rainfall,
    });
    const res = await fetch(`${API}/predict?${q}`);
    if (res.status !== 200) {
      console.log(`  FAIL: /predict returned ${res.status}`);
      failures++;
      continue;
    }
    const data = await res.json();
    const ranked = data.keras_prediction
      .map((p, i) => ({ crop: CROPS[i], p }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 3);

    console.log("  top 3     " + ranked.map((r) => `${r.crop.display} ${(r.p * 100).toFixed(1)}%`).join(", "));

    // The description file for the winner must exist — this is the lookup that
    // used to 404 for 16 of the 22 classes.
    const file = path.join("backend", "cropTexts", ranked[0].crop.file + ".txt");
    if (!fs.existsSync(file)) {
      console.log(`  FAIL: missing ${file}`);
      failures++;
    } else {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      const desc = (lines[1] || "").trim();
      if (!desc) {
        console.log("  FAIL: description line empty");
        failures++;
      } else {
        console.log(`  blurb     ${desc.slice(0, 78)}${desc.length > 78 ? "…" : ""}`);
      }
    }
  }

  console.log(failures === 0 ? "\nOK: full pipeline works for every site" : `\n${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
