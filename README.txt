ALAVIA — Real-time Airfare Price Index for India
Smart India Hackathon 2026 · Problem statement 26056


HOW TO OPEN

Easiest: double-click index.html. It opens in your default browser and
works fully offline — fonts, the chart library and all images are bundled
inside the assets folder, so no internet connection is needed at the venue.

If double-clicking doesn't open it in a browser:
  - Right-click index.html -> Open with -> Chrome or Edge.
  - Or open your browser first, then drag index.html onto the window.

From a terminal, instead of double-clicking:
  Windows (Command Prompt, inside this folder):
      start index.html
  Mac / Linux (Terminal, inside this folder):
      open index.html


TO PUT IT ONLINE

Upload the whole folder (index.html + assets) to GitHub Pages, Netlify or
Vercel. No build step, no server, no dependencies to install.

Quickest option — Netlify Drop:
  1. Go to app.netlify.com/drop
  2. Drag this whole folder onto the page
  3. You get a public link in a few seconds


FILES

index.html              The page
assets/style.css        Layout and visual design
assets/fonts.css        Embedded fonts (Jost, Cormorant Garamond)
assets/app.js           All logic: index calculation, the fare board,
                         charts, the route map, tables, search and CSV export
assets/data.js          The fare dataset (2,100 records). Replace this file
                         to update every number and chart on the site.
assets/img/              Logo, emblem, favicon, social share image
assets/vendor/           Chart.js 4.4.4 (MIT licence)


UPDATING THE DATA

Keep the same structure in data.js: a "meta" object (routes, airlines,
years) and a "fares" array of {route, airline, year, direction, price,
type} records, where type is "actual" or "forecast". Every number on the
page — the all-India index, every chart, the ranked table, the CSV
exports — is recalculated live in the browser from this one file, so
there is nothing else to keep in sync.
