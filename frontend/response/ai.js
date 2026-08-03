// Display names for the model's 22 output classes, in index order.
//
// The order is the alphabetical label encoding of the crop-recommendation
// dataset the model was trained on — the same 22 labels that name the files in
// backend/cropTexts/. Two things depend on this list staying in that order:
// the index -> crop mapping, and the growing-notes lookup, which lowercases a
// name and strips spaces to build the filename ("Kidney Beans" ->
// kidneybeans.txt). The previous list was in an arbitrary order with
// pluralised names, so predictions could label the wrong crop and most
// growing-notes fetches 404'd ("Rices" -> rices.txt, which doesn't exist).
const allCrops = ['Apple', 'Banana', 'Blackgram', 'Chickpea', 'Coconut',
    'Coffee', 'Cotton', 'Grapes', 'Jute', 'Kidney Beans', 'Lentil',
    'Maize', 'Mango', 'Moth Beans', 'Mung Bean', 'Muskmelon', 'Orange',
    'Papaya', 'Pigeon Peas', 'Pomegranate', 'Rice', 'Watermelon'];

document.addEventListener("DOMContentLoaded", function () {
    const columns = document.querySelectorAll(".column");

    columns.forEach(column => {
        column.addEventListener("click", function () {
            if (column.getAttribute("id") === "ai") {
                this.classList.toggle("expanded");
            }
            const hiddenText = this.querySelector('.hidden-text');
            if (hiddenText) {
                hiddenText.style.display = this.classList.contains('expanded') ? 'block' : 'none';
            }
        });
    });
    makeAIRequest().catch(error => {
        console.error('Error:', error);
        document.getElementById('crop1').innerText = "Couldn't reach the weather or prediction service. Please try again later, or access the landing page again.";
    });
});

// main function!
// getWeather() has to be awaited: it writes temp/humidity/rainfall into localStorage
// from a fetch, so reading them synchronously right after the call returned nulls and
// the model was asked to predict on temperature=0, humidity=0, rainfall=0.
async function makeAIRequest() {
    // Arriving here without picking a location on the landing page would
    // otherwise fetch weather for (0, 0) — Number(null) is 0 — and predict for
    // a point in the Gulf of Guinea.
    if (localStorage.getItem("latitude") === null || localStorage.getItem("longitude") === null) {
        document.getElementById('crop1').innerText = "No location saved yet — go back to the landing page and pick a point on the map first.";
        return;
    }
    const weather = await getWeather();
    const params = new URLSearchParams({
        nitrogen: 90,
        phosphorus: 42,
        potassium: 43,
        temperature: weather.temp,
        humidity: weather.humidity,
        ph: 6.75,
        rainfall: weather.rainfall
    })
    var url = `http://127.0.0.1:5000/predict?${params.toString()}`;
    console.log("AI requested at: " + url);
    fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(response => response.json())
        .then(data => {
            var predictions = data.keras_prediction;
            if (predictions === undefined || predictions[0] === undefined) {
                document.getElementById('crop1').innerText = "There seems to be an issue with the prediction model. Please try again later, or access the landing page again.";
                return;
            }
            // Rank by probability. This used to read allCrops[ind + 2] and [ind + 4] —
            // array neighbours rather than the next-likeliest crops, which also ran off
            // the end of the list whenever the top crop sat near the end.
            var ranked = predictions
                .map(function (p, i) { return { crop: allCrops[i], score: p }; })
                .sort(function (a, b) { return b.score - a.score; });
            var ind = allCrops.indexOf(ranked[0].crop);

            {
                document.getElementById('crop1').innerText = "The best crop for your location is " + ranked[0].crop + "!";
                document.getElementById('crop2').innerText = "Another crop that will thrive in your area is " + ranked[1].crop + ".";
                document.getElementById('crop3').innerText = ranked[2].crop + " is also a strong match for your conditions.";
                var str = allCrops[ind];
                str = str.toLowerCase();
                for (var x = 0; x < str.length; x++) {
                    if (str.charAt(x) === ' ') { str = str.replace(' ', ''); }
                }
                str = str.toLowerCase();
                str = str + ".txt";
                console.log("Crop text requested using: " + str);
                fetch("../../backend/cropTexts/" + str)
                    .then((res) => res.text())
                    .then((text) => {
                        arr = text.split("\n");
                        // arr[1] is the description of the crop
                        // arr[5 - 6] is how to plant them
                        // and arr[9 - 11] is how to care for them
                        console.log(arr);
                        document.getElementById('desc').innerText = arr[1];
                        document.getElementById('how').innerText = arr[5];
                        document.getElementById('how2').innerText = arr[6];
                        document.getElementById('prac').innerText = arr[9];
                        document.getElementById('prac2').innerText = arr[10];
                        document.getElementById('prac3').innerText = arr[11];
                    })
                    .catch((e) => console.error(e));
            }
        })
        .catch(error => console.error('Error:', error));
}

// All API callings
// Resolves with the current conditions so the caller can feed them straight to the
// model, and still caches them in localStorage for the rest of the page.
async function getWeather() {
    const lat = Number(localStorage.getItem("latitude"));
    const lon = Number(localStorage.getItem("longitude"));
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,rain`;
    console.log("Weather requested at: " + url);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Network response was not ok");
    }
    const data = await response.json();

    const hour = new Date().getHours();
    const temp = data.hourly.temperature_2m[hour].toFixed(2);
    const humidity = data.hourly.relative_humidity_2m[hour].toFixed(2);
    const rainfall = data.hourly.rain[hour].toFixed(2);

    localStorage.setItem("temp", temp);
    localStorage.setItem("humidity", humidity);
    localStorage.setItem("rainfall", rainfall);
    document.getElementById('temp').innerText = "Temperature in Celsius: " + temp;
    document.getElementById('humid').innerText = "Humidity in percent: " + humidity;
    document.getElementById('rain').innerText = "Rainfall in millimeters: " + rainfall;

    return { temp: temp, humidity: humidity, rainfall: rainfall };
}