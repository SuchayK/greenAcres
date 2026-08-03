// Sanity checks for the crop label table in frontend/response/ai.js.
//
//   node check_crop_map.js          structural checks only
//   node check_crop_map.js --live   also asserts label order against the model
//                                   (requires `python ai.py` to be running)
//
// The live check exists because a wrong label order is invisible: the app keeps
// working and simply names the wrong crop. That is exactly what the competition
// version did on every prediction.

const fs = require("fs");
const path = require("path");

const SRC = path.join("frontend", "response", "ai.js");
const TEXTS = path.join("backend", "cropTexts");
const API = "http://127.0.0.1:5000";

// Known-good profiles from the training data, with the class each should yield.
const PROBES = [
  { crop: "Apples",     n: 21,  p: 134, k: 200, t: 22.6, h: 92.3, ph: 5.9, r: 112.6 },
  { crop: "Coffee",     n: 101, p: 28,  k: 30,  t: 25.5, h: 58.9, ph: 6.8, r: 158.1 },
  { crop: "Cotton",     n: 117, p: 46,  k: 20,  t: 24.0, h: 79.8, ph: 6.9, r: 80.4 },
  { crop: "Rice",       n: 80,  p: 47,  k: 40,  t: 23.7, h: 82.0, ph: 6.4, r: 236 },
  { crop: "Watermelon", n: 99,  p: 17,  k: 50,  t: 25.6, h: 85.0, ph: 6.5, r: 50.8 },
];

function loadCrops() {
  const src = fs.readFileSync(SRC, "utf8");
  const block = src.match(/const CROPS = \[([\s\S]*?)\n\];/)[1];
  const out = [];
  const re = /display:\s*'([^']+)',\s*file:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(block)) !== null) out.push({ display: m[1], file: m[2] });
  return out;
}

function structural(crops) {
  const files = new Set(fs.readdirSync(TEXTS).map((f) => f.replace(/\.txt$/, "")));
  let bad = 0;

  if (crops.length !== 22) {
    console.log(`FAIL: expected 22 classes, found ${crops.length}`);
    bad++;
  }

  for (const c of crops) {
    if (!files.has(c.file)) {
      console.log(`FAIL: ${c.display} -> ${c.file}.txt does not exist`);
      bad++;
    }
  }

  // The model's label encoding is alphabetical; the file slugs are the labels.
  const sorted = [...crops].map((c) => c.file).sort();
  crops.forEach((c, i) => {
    if (c.file !== sorted[i]) {
      console.log(`FAIL: index ${i} is '${c.file}', alphabetical order expects '${sorted[i]}'`);
      bad++;
    }
  });

  console.log(bad === 0 ? `OK: ${crops.length} classes, files present, order alphabetical` : `${bad} structural problem(s)`);
  return bad;
}

async function live(crops) {
  let bad = 0;
  for (const probe of PROBES) {
    const q = new URLSearchParams({
      nitrogen: probe.n, phosphorus: probe.p, potassium: probe.k,
      temperature: probe.t, humidity: probe.h, ph: probe.ph, rainfall: probe.r,
    });
    let data;
    try {
      const res = await fetch(`${API}/predict?${q}`);
      data = await res.json();
    } catch {
      console.log("SKIP: prediction service not reachable at " + API);
      return 0;
    }
    const p = data.keras_prediction;
    const i = p.indexOf(Math.max(...p));
    const got = crops[i].display;
    const ok = got === probe.crop;
    if (!ok) bad++;
    console.log(
      `${ok ? "OK  " : "FAIL"}  ${probe.crop.padEnd(12)} -> idx ${String(i).padStart(2)} ` +
      `${got.padEnd(12)} ${(p[i] * 100).toFixed(0)}%`
    );
  }
  console.log(bad === 0 ? "OK: label order matches the trained model" : `${bad} label(s) mismatched`);
  return bad;
}

(async () => {
  const crops = loadCrops();
  let bad = structural(crops);
  if (process.argv.includes("--live")) bad += await live(crops);
  process.exit(bad === 0 ? 0 : 1);
})();
