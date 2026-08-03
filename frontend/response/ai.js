// Green Acres — results page.
//
// See FIXES.md for what changed relative to the competition version on `main`.

const API_BASE = "http://127.0.0.1:5000";

// Model classes, in the model's own output order, each paired with its
// description file. One array so the label and the file can never drift apart.
//
// THE ORDER IS ALPHABETICAL BY THE TRAINING LABEL, AND THAT IS NOT COSMETIC.
// The model was trained with a standard alphabetical label encoding. The old
// hand-written list was in a different, arbitrary order, so every prediction
// resolved to the wrong name — feeding textbook rice conditions produced
// "Watermelons", apple conditions produced "Moth Beans", and so on. Verified
// against the trained model with five known crop profiles, each returning its
// correct alphabetical index at 97-100% confidence. Do not reorder this.
const CROPS = [
    { display: 'Apples', file: 'apple' },            //  0
    { display: 'Bananas', file: 'banana' },          //  1
    { display: 'Blackgram', file: 'blackgram' },     //  2
    { display: 'Chickpeas', file: 'chickpea' },      //  3
    { display: 'Coconuts', file: 'coconut' },        //  4
    { display: 'Coffee', file: 'coffee' },           //  5
    { display: 'Cotton', file: 'cotton' },           //  6
    { display: 'Grapes', file: 'grapes' },           //  7
    { display: 'Jute', file: 'jute' },               //  8
    { display: 'Kidney Beans', file: 'kidneybeans' },//  9
    { display: 'Lentils', file: 'lentil' },          // 10
    { display: 'Maize', file: 'maize' },             // 11
    { display: 'Mangoes', file: 'mango' },           // 12
    { display: 'Moth Beans', file: 'mothbeans' },    // 13
    { display: 'Mung Beans', file: 'mungbean' },     // 14
    { display: 'Muskmelons', file: 'muskmelon' },    // 15
    { display: 'Oranges', file: 'orange' },          // 16
    { display: 'Papayas', file: 'papaya' },          // 17
    { display: 'Pigeon Peas', file: 'pigeonpeas' },  // 18
    { display: 'Pomegranates', file: 'pomegranate' },// 19
    { display: 'Rice', file: 'rice' },               // 20
    { display: 'Watermelon', file: 'watermelon' }    // 21
];

// Dataset medians, used only until the grower enters their own soil test.
// The UI labels these as estimates rather than passing them off as measured.
const SOIL_DEFAULTS = { nitrogen: 90, phosphorus: 42, potassium: 43, ph: 6.75 };

document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".column").forEach(column => {
        column.addEventListener("click", function () {
            if (column.getAttribute("id") === "ai") this.classList.toggle("expanded");
            const hiddenText = this.querySelector('.hidden-text');
            if (hiddenText) {
                hiddenText.style.display = this.classList.contains('expanded') ? 'block' : 'none';
            }
        });
    });

    const recalc = document.getElementById('recalc');
    if (recalc) {
        recalc.addEventListener('click', (e) => {
            e.stopPropagation();   // the soil panel is click-to-expand
            run();
        });
    }

    run();
});

async function run() {
    const lat = Number(localStorage.getItem("latitude"));
    const lon = Number(localStorage.getItem("longitude"));

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        setText('crop1', "No location set. Go back to the landing page and pick a point on the map.");
        return;
    }

    setText('crop1', "Working…");

    // The old code called getWeather() and then read localStorage on the very
    // next line. getWeather() is asynchronous, so on a cold load nothing had
    // been written yet and the model was asked to classify 0 degrees, 0%
    // humidity and 0 mm rain. Both lookups are awaited now.
    const [weather, soil] = await Promise.all([getWeather(lat, lon), getSoil(lat, lon)]);

    if (!weather) {
        setText('crop1', "Couldn't reach the weather service. Check your connection and try again.");
        return;
    }

    renderWeather(weather);
    renderSoil(soil);

    const predictions = await predict({
        nitrogen: soil.nitrogen,
        phosphorus: soil.phosphorus,
        potassium: soil.potassium,
        temperature: weather.temperature,
        humidity: weather.humidity,
        ph: soil.ph,
        rainfall: weather.rainfall
    });
    if (!predictions) return;

    renderRanking(predictions);
}

async function predict(features) {
    const url = `${API_BASE}/predict?${new URLSearchParams(features).toString()}`;
    console.log("Prediction requested at: " + url);
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
            setText('crop1', "The prediction service rejected the request: " + data.error);
            return null;
        }
        if (!Array.isArray(data.keras_prediction)) {
            setText('crop1', "Unexpected response from the prediction service.");
            return null;
        }
        return data.keras_prediction;
    } catch (e) {
        console.error(e);
        setText('crop1',
            "Couldn't reach the prediction service. Start it with `python ai.py` in frontend/response, then reload.");
        return null;
    }
}

// Ranks the softmax output and shows the top three.
//
// The old code found the single highest index and then printed allCrops[i+2]
// and allCrops[i+4] as the runners-up — array neighbours, not the next most
// likely crops, and undefined whenever the winner sat near the end of the list.
function renderRanking(predictions) {
    const ranked = predictions
        .map((p, i) => ({ crop: CROPS[i], p }))
        .filter(r => r.crop !== undefined)
        .sort((a, b) => b.p - a.p);

    const pct = (p) => (p * 100).toFixed(1) + "%";

    setText('crop1', `Best crop for your location: ${ranked[0].crop.display} (${pct(ranked[0].p)} confidence)`);
    setText('crop2', ranked[1] ? `Also suited: ${ranked[1].crop.display} (${pct(ranked[1].p)})` : "");
    setText('crop3', ranked[2] ? `Also suited: ${ranked[2].crop.display} (${pct(ranked[2].p)})` : "");

    loadCropText(ranked[0].crop);
}

async function loadCropText(crop) {
    const slug = crop && crop.file;
    if (!slug) return;
    try {
        const res = await fetch(`../../backend/cropTexts/${slug}.txt`);
        if (!res.ok) throw new Error(`${slug}.txt -> ${res.status}`);
        const arr = (await res.text()).split("\n");
        // arr[1] description; arr[5..6] planting; arr[9..11] care
        setText('desc', arr[1]);
        setText('how', arr[5]);
        setText('how2', arr[6]);
        setText('prac', arr[9]);
        setText('prac2', arr[10]);
        setText('prac3', arr[11]);
    } catch (e) {
        console.error(e);
    }
}

async function getWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=temperature_2m,relative_humidity_2m,rain`;
    console.log("Weather requested at: " + url);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("weather " + res.status);
        const data = await res.json();
        const hour = Math.min(new Date().getHours(), data.hourly.temperature_2m.length - 1);
        return {
            temperature: Number(data.hourly.temperature_2m[hour].toFixed(2)),
            humidity: Number(data.hourly.relative_humidity_2m[hour].toFixed(2)),
            rainfall: Number(data.hourly.rain[hour].toFixed(2))
        };
    } catch (e) {
        console.error(e);
        return null;
    }
}

// Soil inputs.
//
// pH comes from ISRIC SoilGrids, which reports pH in water at 0-5 cm as pH*10 —
// directly comparable to the model's pH feature.
//
// N, P and K are NOT derived. SoilGrids reports total soil nitrogen in cg/kg,
// whereas the training data uses plant-available nutrients in kg/ha; there is no
// honest conversion between them, and there is no free API for available P and K
// at this resolution. So they stay grower-entered, defaulting to dataset medians
// that the UI labels as estimates. Anyone with a soil test can type real values.
async function getSoil(lat, lon) {
    const soil = {
        nitrogen: readField('in-n', SOIL_DEFAULTS.nitrogen),
        phosphorus: readField('in-p', SOIL_DEFAULTS.phosphorus),
        potassium: readField('in-k', SOIL_DEFAULTS.potassium),
        ph: SOIL_DEFAULTS.ph,
        phSource: "default"
    };

    const phField = document.getElementById('in-ph');
    if (phField && phField.value.trim() !== "") {
        soil.ph = Number(phField.value);
        soil.phSource = "entered";
        return soil;
    }

    const url = `https://rest.isric.org/soilgrids/v2.0/properties/query` +
        `?lon=${lon}&lat=${lat}&property=phh2o&depth=0-5cm&value=mean`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("soilgrids " + res.status);
        const data = await res.json();
        const raw = data.properties.layers[0].depths[0].values.mean;
        if (raw !== null && raw !== undefined) {
            soil.ph = raw / 10;          // reported as pH*10
            soil.phSource = "SoilGrids";
        }
    } catch (e) {
        console.error("SoilGrids lookup failed, using default pH:", e);
    }
    return soil;
}

function readField(id, fallback) {
    const el = document.getElementById(id);
    if (!el || el.value.trim() === "") return fallback;
    const n = Number(el.value);
    return Number.isFinite(n) ? n : fallback;
}

function renderWeather(w) {
    setText('temp', "Temperature in Celsius: " + w.temperature);
    setText('humid', "Humidity in percent: " + w.humidity);
    setText('rain', "Rainfall in millimeters: " + w.rainfall);
}

// The soil panel used to show a static table (pH 5.5, N 5%, P 0.045%, K 2.5%)
// that had nothing to do with the numbers actually sent to the model. It now
// shows exactly what was sent, and where each value came from.
function renderSoil(s) {
    setText('out-ph', s.ph);
    setText('out-n', s.nitrogen);
    setText('out-p', s.phosphorus);
    setText('out-k', s.potassium);

    const label = {
        "SoilGrids": "pH from ISRIC SoilGrids for this location.",
        "entered": "pH as you entered it.",
        "default": "pH is a dataset default — SoilGrids was unreachable."
    }[s.phSource];
    setText('soil-source', label + " N, P and K are your entries, or dataset estimates if left blank.");

    setValueIfEmpty('in-n', s.nitrogen);
    setValueIfEmpty('in-p', s.phosphorus);
    setValueIfEmpty('in-k', s.potassium);
    setValueIfEmpty('in-ph', s.ph);
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function setValueIfEmpty(id, value) {
    const el = document.getElementById(id);
    if (el && el.value.trim() === "") el.value = value;
}
