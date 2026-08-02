<h1 align="center">
  <img src="backend/logo.png" alt="Green Acres" width="260">
</h1>

<p align="center">
  Crop recommendation from where you are — pick a point on a map, get the crops that will
  actually grow there.
</p>

<p align="center">
  <img alt="1st place, Texas TSA State Conference 2025" src="https://img.shields.io/badge/%F0%9F%A5%87%201st%20Place-Texas%20TSA%20State%20Conference%202025-BF5700?style=flat-square">
  <img alt="Top 16 at TSA Nationals 2025" src="https://img.shields.io/badge/Top%2016-TSA%20Nationals%202025-1f6feb?style=flat-square">
</p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white">
  <img alt="TensorFlow" src="https://img.shields.io/badge/TensorFlow-FF6F00?style=flat-square&logo=tensorflow&logoColor=white">
  <img alt="Flask" src="https://img.shields.io/badge/Flask-000000?style=flat-square&logo=flask&logoColor=white">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black">
  <img alt="Leaflet" src="https://img.shields.io/badge/Leaflet-199900?style=flat-square&logo=leaflet&logoColor=white">
</p>

---

## Results

Built for the **TSA Software Development** event, 2024–2025 season.

| Placement | Competition |
|---|---|
| 🥇 **1st place** | Texas TSA State Conference |
| **Top 16** | TSA National Conference |

## The problem

TSA's theme statement for the season:

> Develop a program that enhances the environment and/or agriculture to be more sustainable
> and efficient.

Planting the wrong crop for your soil and climate wastes a season. The information needed to
make that call — nitrogen, phosphorus, potassium, pH, and the local temperature, humidity and
rainfall — is scattered across agronomy references and weather services, and it isn't obvious
how to combine them.

Green Acres collapses that into one interaction: **click where you farm, get a ranked crop
recommendation.**

## How it works

```
  Leaflet map            Open-Meteo               Flask API              Keras model
  click a point   ──►    temperature      ──►     /predict       ──►     22-class
  or type lat,lon        humidity                 7 features             softmax
                         rainfall                                            │
                                                                             ▼
                                                                    ranked crops +
                                                                    growing notes
```

1. **Pick a location.** A Leaflet map over OpenStreetMap tiles; click anywhere or type
   `latitude, longitude`. The coordinates are validated and held in `localStorage`.
2. **Fetch conditions.** [Open-Meteo](https://open-meteo.com/) supplies temperature, relative
   humidity and rainfall for that point — no API key required.
3. **Predict.** Those three plus four soil values go to the Flask service as seven features.
   A Keras model returns a softmax over **22 crops**, and a TFLite build of the same model runs
   alongside it for comparison.
4. **Explain.** The top crops are paired with growing notes from `backend/cropTexts/`.

The model recommends across: apple, banana, blackgram, chickpea, coconut, coffee, cotton,
grapes, jute, kidney beans, lentil, maize, mango, moth beans, mung bean, muskmelon, orange,
papaya, pigeon peas, pomegranate, rice, and watermelon.

## Running it

The frontend is static and the model service is a local Flask app. You need both.

**1. Start the prediction service**

```bash
pip install flask flask-cors numpy tensorflow
cd frontend/response
python ai.py
```

It serves on `http://127.0.0.1:5000`. `ai.py` loads `my_model.keras` and
`optimized_model.tflite` from its own directory, so start it from `frontend/response/` or the
model paths won't resolve.

**2. Open the frontend**

Open `frontend/land/land.html` in a browser, choose a location, then continue to the results
page. CORS is already enabled on the Flask app, so `file://` works.

**3. Check it directly (optional)**

```bash
curl "http://127.0.0.1:5000/predict?nitrogen=90&phosphorus=42&potassium=43&temperature=21&humidity=82&ph=6.75&rainfall=203"
```

Returns the echoed inputs plus `keras_prediction` and `tflite_prediction` — each a 22-element
probability vector aligned to the crop list above.

## Layout

```
frontend/
├── land/            map + coordinate entry (Leaflet, localStorage)
└── response/
    ├── ai.py                 Flask service — GET /predict
    ├── ai.html / .js / .css  results page, Open-Meteo fetch, prediction display
    ├── my_model.keras        trained classifier
    └── optimized_model.tflite  TFLite build of the same model
backend/
├── cropTexts/       growing notes for each of the 22 crops
└── logo.png
apiLinks.txt         data sources and the fields we needed from each
```

## Known limitations

Honest about what a two-day competition build didn't get to:

- **Soil values are hardcoded.** Nitrogen, phosphorus, potassium and pH are fixed at
  `90 / 42 / 43 / 6.75` in `ai.js` — only temperature, humidity and rainfall come from your
  location. We couldn't find a free soil API with the coverage we needed (see `apiLinks.txt`).
  Predictions therefore vary with climate but not with your actual soil.
- **The second and third suggestions are wrong.** `ai.js` reads `allCrops[ind + 2]` and
  `allCrops[ind + 4]` — neighbours in the array, not the next-highest probabilities, and they
  run off the end of the list when the top crop is near the end. It should sort the prediction
  vector and take the top three.
- **`GET /predict` has no input validation** beyond a `try/except`, and `render_template` on
  `/` won't resolve because there's no `templates/` directory. Use the static frontend.
- **Leaflet is pinned to 0.7.3 over plain HTTP** from a CDN, which modern browsers will block on
  an HTTPS page.

## Team

Built by three students for TSA Software Development, 2024–2025.

| | Role | Grade |
|---|---|---|
| **Stavya Palassery** | Team Lead, Frontend | 11 |
| **Vamsi Yadagiri** | AI Model Developer | 9 |
| **Suchay Kommisetty** | Database and API Manager | 11 |

<sub>First coding experiences, for the record: a Tic Tac Toe site in HTML/CSS/JS; Minecraft Hour
of Code; and Pre-Algebra homework automated with Java and some Python.</sub>
