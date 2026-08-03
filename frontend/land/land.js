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

var map = L.map('map').setView([38.7946, -96.85547], 4);

// Tiles must be served over HTTPS -- the page itself is served over HTTPS on GitHub
// Pages, and browsers block mixed content, so the http:// tiles never loaded there.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

map.on('click', function(e) {
    var popup = L.popup();
    // wrap() normalises longitude into [-180, 180] after the map has been panned
    // across the antimeridian; latitude is already constrained to [-90, 90].
    var latlng = e.latlng.wrap();
    var lat = latlng.lat.toFixed(2);
    var lon = latlng.lng.toFixed(2);
    popup
        .setLatLng(e.latlng)
        .setContent("You clicked the map at " + lat + ", " + lon)
        .openOn(map);
    localStorage.setItem("latitude", lat);
    localStorage.setItem("longitude", lon);
});