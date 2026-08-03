document.addEventListener("DOMContentLoaded", function () {
    localStorage.clear();
    const input = document.getElementById('coords');
    const submit = document.getElementById('saveCoords');
    const save = document.getElementById('saved');
    save.style.display = 'none';
    
    submit.addEventListener('click', function () {
        const inp = input.value;
        const regex = /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/;
        save.style.display = 'block';
        setTimeout(() => {
            save.style.display = 'none';
        }, 3000);
        if (regex.test(inp)) {
            console.log('Valid coordinates:', inp);
            save.innerText = "Saved!";
            localStorage.setItem("latitude", Number(inp.split(',')[0].trim()));
            localStorage.setItem("longitude", Number(inp.split(',')[1].trim()));
        } else {
            save.innerText = "Incorrect format inputted!";
            console.error('User-entered information doesn\'t follow the format x,y');
        }
        input.value = '';
    });
});

// Centre on the continental US. The old value was [38.7946, 263.14453] — a
// longitude of 263 is off the map; it should have been 263.14 - 360 = -96.86.
var map = L.map('map').setView([38.7946, -96.86], 4);

// Tiles over https. The old URL was http://{s}.tile.osm.org, which browsers
// block as mixed content on an https page — and it was added twice, stacking
// two identical layers.
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

map.on('click', function (e) {
    // The old code normalised by hand, wrapping latitude to +/-180 — latitude
    // only runs to +/-90 — while operating on strings returned by toFixed(),
    // so the arithmetic ran on text. Leaflet's wrap() handles the map repeating
    // horizontally when you scroll past the antimeridian.
    var wrapped = e.latlng.wrap();
    var lat = wrapped.lat.toFixed(2);
    var lon = wrapped.lng.toFixed(2);

    L.popup()
        .setLatLng(e.latlng)
        .setContent("You clicked the map at " + lat + ", " + lon)
        .openOn(map);

    localStorage.setItem("latitude", lat);
    localStorage.setItem("longitude", lon);
});