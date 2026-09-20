/* =====================================================================
   ALAVIA · Airfare Price Index for India
   Everything on the page is computed from assets/data.js in the browser.
   ===================================================================== */
(function () {
  "use strict";

  if (typeof ALAVIA_DATA === "undefined") {
    document.body.insertAdjacentHTML("afterbegin",
      '<p style="padding:14px 20px;background:#EC9A7C;color:#0A1428;margin:0">The data file (assets/data.js) did not load. Keep the assets folder next to index.html.</p>');
    return;
  }

  var D = ALAVIA_DATA;
  var META = D.meta;
  var CUR = META.currentYear;
  var BASE = 2024;
  var YEARS = META.years.slice();
  var FIRST_PROJ = CUR + 1;
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var $ = function (id) { return document.getElementById(id); };
  var fmtMoney = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  var money = function (v) { return v == null || isNaN(v) ? "n/a" : fmtMoney.format(v); };
  var fmtIdx = function (v) { return v == null || isNaN(v) ? "n/a" : v.toFixed(1); };
  var pct = function (v) { return v == null || isNaN(v) ? "n/a" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%"; };
  var mean = function (a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; };
  var isProj = function (y) { return y > CUR; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* ------------------------------------------------------------ reference data */
  var CITY = {
    "Delhi":     { code: "DEL", lat: 28.61, lon: 77.21, hub: true,  lx: 10,  ly: -6,  anchor: "start" },
    "Mumbai":    { code: "BOM", lat: 19.08, lon: 72.88, hub: true,  lx: -10, ly: 0,   anchor: "end" },
    "Bangalore": { code: "BLR", lat: 12.97, lon: 77.59, hub: true,  lx: -10, ly: 4,   anchor: "end" },
    "Hyderabad": { code: "HYD", lat: 17.39, lon: 78.49, hub: true,  lx: 11,  ly: 4,   anchor: "start" },
    "Chennai":   { code: "MAA", lat: 13.08, lon: 80.27, hub: false, lx: 9,   ly: 4,   anchor: "start" },
    "Kolkata":   { code: "CCU", lat: 22.57, lon: 88.36, hub: false, lx: 0,   ly: -12, anchor: "middle" },
    "Pune":      { code: "PNQ", lat: 18.52, lon: 73.86, hub: false, lx: 6,   ly: 16,  anchor: "start" },
    "Ahmedabad": { code: "AMD", lat: 23.02, lon: 72.57, hub: false, lx: -9,  ly: 4,   anchor: "end" },
    "Jaipur":    { code: "JAI", lat: 26.91, lon: 75.79, hub: false, lx: -9,  ly: 4,   anchor: "end" },
    "Kochi":     { code: "COK", lat: 9.93,  lon: 76.27, hub: false, lx: -9,  ly: 4,   anchor: "end" }
  };
  var CARRIER = { "IndiGo": "6E", "Air India": "AI", "SpiceJet": "SG", "Vistara": "UK", "AirAsia": "I5" };
  var AIRLINE_COLOR = { "Air India": "#EC9A7C", "AirAsia": "#F2EEE3", "IndiGo": "#8DB4E6", "SpiceJet": "#D6B25E", "Vistara": "#72C9B4" };
  var HUBS = ["Delhi", "Mumbai", "Bangalore", "Hyderabad"];
  var HUB_COLOR = { "Delhi": "#D6B25E", "Mumbai": "#8DB4E6", "Bangalore": "#72C9B4", "Hyderabad": "#EC9A7C" };
  var C = { gold: "#D6B25E", goldPale: "#F0D9A0", ivory: "#F2EEE3", silver: "#AEB6C6", muted: "#8F9BB3", grid: "rgba(174,182,198,0.10)", deep: "#070F20" };

  /* ------------------------------------------------------------ model */
  var ROUTES = META.routes.map(function (name) {
    var parts = name.split("↔").map(function (s) { return s.trim(); });
    var a = parts[0], b = parts[1];
    return {
      name: name, a: a, b: b,
      label: a + " – " + b,
      code: (CITY[a] ? CITY[a].code : a.slice(0, 3).toUpperCase()) + "-" + (CITY[b] ? CITY[b].code : b.slice(0, 3).toUpperCase())
    };
  });
  var ROUTE_BY_NAME = {};
  ROUTES.forEach(function (r) { ROUTE_BY_NAME[r.name] = r; });

  var LANES = {};
  D.fares.forEach(function (f) {
    var k = f.route + "|" + f.airline + "|" + f.direction;
    if (!LANES[k]) LANES[k] = { route: f.route, airline: f.airline, dir: f.direction, p: {}, model: D.models ? D.models[k] : null };
    LANES[k].p[f.year] = f.price;
  });
  var LANE_LIST = Object.keys(LANES).map(function (k) { return LANES[k]; });

  function lanesWhere(f) {
    return LANE_LIST.filter(function (l) {
      return (!f.route || l.route === f.route) && (!f.airline || l.airline === f.airline) && (!f.dir || l.dir === f.dir);
    });
  }

  // Spread for projections widens with the horizon; recorded years carry none
  function spread(lane, year) {
    if (!isProj(year)) return 0;
    var se = lane.model && lane.model.stderr ? lane.model.stderr : lane.p[year] * 0.03;
    return se * (1 + (year - CUR) * 0.4);
  }
  function lanePrice(lane, year, band) {
    var p = lane.p[year];
    if (p == null) return null;
    if (band === "low") return p - spread(lane, year);
    if (band === "high") return p + spread(lane, year);
    return p;
  }

  // Jevons elementary index: geometric mean of price relatives vs base year
  function jevons(lanes, year, band) {
    var logs = [];
    lanes.forEach(function (l) {
      var p = lanePrice(l, year, band), b = l.p[BASE];
      if (p != null && b) logs.push(Math.log(p / b));
    });
    return logs.length ? 100 * Math.exp(mean(logs)) : null;
  }

  var routeIdxCache = {};
  function routeIndex(routeName, year, dir, band) {
    var k = routeName + "|" + year + "|" + (dir || "") + "|" + (band || "");
    if (!(k in routeIdxCache)) routeIdxCache[k] = jevons(lanesWhere({ route: routeName, dir: dir }), year, band);
    return routeIdxCache[k];
  }
  // Laspeyres aggregate with base-period weights (equal in the prototype)
  var WEIGHTS = {};
  ROUTES.forEach(function (r) { WEIGHTS[r.name] = 1 / ROUTES.length; });
  function allIndia(year, band) {
    var s = 0, w = 0;
    ROUTES.forEach(function (r) {
      var v = routeIndex(r.name, year, null, band);
      if (v != null) { s += v * WEIGHTS[r.name]; w += WEIGHTS[r.name]; }
    });
    return w ? s / w : null;
  }
  function airlineIndex(airline, year) { return jevons(lanesWhere({ airline: airline }), year); }
  function hubIndex(hub, year) {
    return mean(ROUTES.filter(function (r) { return r.a === hub; }).map(function (r) { return routeIndex(r.name, year); }));
  }
  function avgFare(f, year) {
    return mean(lanesWhere(f).map(function (l) { return l.p[year]; }).filter(function (v) { return v != null; }));
  }
  function avgSpread(f, year) {
    return mean(lanesWhere(f).map(function (l) { return spread(l, year); }));
  }
  function carriersFor(routeName, year, dir) {
    return META.airlines.map(function (a) {
      return { airline: a, fare: avgFare({ route: routeName, airline: a, dir: dir }, year) };
    }).filter(function (x) { return x.fare != null; }).sort(function (x, y) { return x.fare - y.fare; });
  }

  var ROUTE_STATS = ROUTES.map(function (r) {
    var idx = routeIndex(r.name, CUR), prev = routeIndex(r.name, CUR - 1);
    return {
      route: r,
      fare: avgFare({ route: r.name }, CUR),
      index: idx,
      yoy: prev ? (idx / prev - 1) * 100 : null,
      proj: routeIndex(r.name, META.forecastEnd),
      series: YEARS.map(function (y) { return routeIndex(r.name, y); }),
      cheapest: carriersFor(r.name, CUR)[0]
    };
  });

  /* ------------------------------------------------------------ small DOM helpers */
  function fillSelect(sel, items, selected) {
    sel.innerHTML = items.map(function (it) {
      var v = typeof it === "object" ? it.value : it, t = typeof it === "object" ? it.text : it;
      return '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? " selected" : "") + ">" + esc(t) + "</option>";
    }).join("");
  }
  document.querySelectorAll("[data-year-current]").forEach(function (el) { el.textContent = CUR; });
  var recordCountText = D.fares.length.toLocaleString("en-IN");
  $("recordCount").textContent = recordCountText;

  /* ================================================================ NAV */
  (function nav() {
    var navEl = $("nav"), toggle = $("navToggle"), links = $("navLinks");
    function setOpen(open) {
      links.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    toggle.addEventListener("click", function () { setOpen(!links.classList.contains("is-open")); });
    links.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });

    var onScroll = function () { navEl.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if ("IntersectionObserver" in window) {
      var map = {};
      links.querySelectorAll("a").forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && map[en.target.id]) {
            Object.keys(map).forEach(function (k) { map[k].classList.remove("is-current"); });
            map[en.target.id].classList.add("is-current");
          }
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      Object.keys(map).forEach(function (id) { var s = $(id); if (s) io.observe(s); });
    }
  })();

  /* ================================================================ FARE BOARD */
  var board = (function () {
    var rowsEl = $("boardRows");
    var PER_PAGE = 6;
    var sorted = ROUTE_STATS.slice().sort(function (a, b) { return b.index - a.index; });
    var pages = Math.ceil(sorted.length / PER_PAGE);
    var page = 0, paused = REDUCED, hovering = false, visible = true, timer = null;
    var COLS = [
      { key: "route", w: 7, cls: "c-route" },
      { key: "carrier", w: 2, cls: "c-carrier" },
      { key: "fare", w: 7, cls: "c-fare", right: true },
      { key: "index", w: 5, cls: "c-index", right: true },
      { key: "change", w: 5, cls: "c-change", right: true },
      { key: "remark", w: 7, cls: "c-remark" }
    ];
    var LETTERS = "ABCDEFGHIJKLMNOPRSTUVWXYZ", DIGITS = "0123456789";

    function remark(yoy) {
      if (yoy == null) return { t: "", tone: "steady" };
      if (yoy < 0) return { t: "EASING", tone: "ease" };
      if (yoy >= 5.5) return { t: "SURGING", tone: "rise" };
      if (yoy >= 4.5) return { t: "RISING", tone: "gold" };
      return { t: "STEADY", tone: "steady" };
    }
    function pad(s, w, right) { s = String(s).replace(/ /g, "\u00a0"); var fill = "\u00a0".repeat(Math.max(0, w - s.length)); return right ? fill + s : s + fill; }

    function values(st) {
      var r = remark(st.yoy);
      return {
        route: st.route.code,
        carrier: st.cheapest ? CARRIER[st.cheapest.airline] || "" : "",
        fare: money(st.fare),
        index: fmtIdx(st.index),
        change: pct(st.yoy).replace("−", "-"),
        remark: r.t, tone: r.tone,
        label: st.route.label + ": average fare " + money(st.fare) + ", index " + fmtIdx(st.index) + ", " + pct(st.yoy) + " over one year, " + r.t.toLowerCase()
      };
    }

    function buildRow(isTotal) {
      var row = document.createElement("div");
      row.className = "board__row" + (isTotal ? " board__row--total" : " is-link");
      row.setAttribute("role", "row");
      COLS.forEach(function (c) {
        var cell = document.createElement("span");
        cell.className = c.cls;
        cell.setAttribute("role", "cell");
        var wrap = document.createElement("span");
        wrap.className = "tiles";
        wrap.setAttribute("aria-hidden", "true");
        for (var i = 0; i < c.w; i++) {
          var t = document.createElement("span");
          t.className = "tile";
          t.textContent = "\u00a0";
          wrap.appendChild(t);
        }
        cell.appendChild(wrap);
        var sr = document.createElement("span");
        sr.className = "sr";
        sr.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)";
        cell.appendChild(sr);
        row.appendChild(cell);
      });
      if (!isTotal) {
        row.tabIndex = 0;
        row.addEventListener("click", function () { if (row.dataset.route) openRoute(row.dataset.route, true); });
        row.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && row.dataset.route) { e.preventDefault(); openRoute(row.dataset.route, true); } });
      }
      rowsEl.appendChild(row);
      return row;
    }

    function flap(tile, target, delay) {
      if (REDUCED) { tile.textContent = target; return; }
      var set = /\d/.test(target) ? DIGITS : LETTERS;
      var steps = target === "\u00a0" && tile.textContent === "\u00a0" ? 0 : 2 + Math.floor(Math.random() * 4);
      var i = 0;
      setTimeout(function tick() {
        tile.classList.remove("is-flipping");
        void tile.offsetWidth;
        tile.classList.add("is-flipping");
        if (i < steps) { tile.textContent = set[Math.floor(Math.random() * set.length)]; i++; setTimeout(tick, 70); }
        else {
          tile.textContent = target;
          setTimeout(function () { tile.classList.remove("is-flipping"); }, 110);
        }
      }, delay);
    }

    function paint(row, v, rowNum) {
      var cells = row.children;
      COLS.forEach(function (c, ci) {
        var cell = cells[ci];
        var text = pad(v[c.key], c.w, c.right);
        var tiles = cell.querySelectorAll(".tile");
        for (var i = 0; i < c.w; i++) {
          var ch = text[i] || "\u00a0";
          if (tiles[i].textContent !== ch) flap(tiles[i], ch, rowNum * 70 + (ci * 3 + i) * 18);
        }
        cell.querySelector(".sr").textContent = c.key === "route" ? v.label : "";
        cell.classList.remove("tone-rise", "tone-ease", "tone-steady", "tone-gold");
        if (c.key === "remark" || c.key === "change") cell.classList.add("tone-" + v.tone);
      });
    }

    var totalRow = buildRow(true);
    var slots = [];
    for (var i = 0; i < PER_PAGE; i++) slots.push(buildRow(false));

    function paintTotal() {
      var idx = allIndia(CUR), prev = allIndia(CUR - 1), yoy = (idx / prev - 1) * 100;
      var v = values({ route: { code: "INDIA", label: "All India" }, fare: avgFare({}, CUR), index: idx, yoy: yoy, cheapest: null });
      v.carrier = "";
      v.tone = "gold";
      paint(totalRow, v, 0);
    }

    function show(p) {
      page = (p + pages) % pages;
      var slice = sorted.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
      slots.forEach(function (row, i) {
        var st = slice[i];
        if (st) {
          row.style.visibility = "";
          row.dataset.route = st.route.name;
          row.setAttribute("aria-label", "Open " + st.route.label);
          paint(row, values(st), i + 1);
        } else {
          row.style.visibility = "hidden";
          row.removeAttribute("data-route");
        }
      });
      $("boardPage").textContent = (page + 1) + " / " + pages;
    }

    function schedule() {
      clearInterval(timer);
      timer = setInterval(function () { if (!paused && !hovering && visible && !document.hidden) show(page + 1); }, 9000);
    }

    var boardEl = $("board");
    boardEl.addEventListener("mouseenter", function () { hovering = true; });
    boardEl.addEventListener("mouseleave", function () { hovering = false; });
    boardEl.addEventListener("focusin", function () { hovering = true; });
    boardEl.addEventListener("focusout", function () { hovering = false; });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(boardEl);
    }
    $("boardPrev").addEventListener("click", function () { show(page - 1); schedule(); });
    $("boardNext").addEventListener("click", function () { show(page + 1); schedule(); });
    var pauseBtn = $("boardPause");
    function setPaused(v) {
      paused = v;
      pauseBtn.setAttribute("aria-pressed", String(v));
      pauseBtn.setAttribute("aria-label", v ? "Resume board rotation" : "Pause board rotation");
    }
    setPaused(paused);
    pauseBtn.addEventListener("click", function () { setPaused(!paused); });

    paintTotal();
    show(0);
    schedule();
    return { show: show };
  })();

  /* ================================================================ CHARTS: shared setup */
  var charts = {};
  function chartReady() { return typeof window.Chart !== "undefined"; }

  var guidesPlugin = {
    id: "alaviaGuides",
    beforeDatasetsDraw: function (chart, args, opts) {
      if (!opts || opts.off) return;
      var ctx = chart.ctx, x = chart.scales.x, y = chart.scales.y, area = chart.chartArea;
      ctx.save();
      // shade the projected years
      if (opts.projFrom != null) {
        var px = x.getPixelForValue(opts.projFrom);
        ctx.fillStyle = "rgba(174,182,198,0.045)";
        ctx.fillRect(px, area.top, area.right - px, area.bottom - area.top);
        ctx.strokeStyle = "rgba(174,182,198,0.25)";
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(px, area.top); ctx.lineTo(px, area.bottom); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.muted;
        ctx.font = "500 12px Jost, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Projected", px + 8, area.top + 14);
      }
      // base-year line
      if (opts.baseY != null && opts.baseY >= y.min && opts.baseY <= y.max) {
        var by = y.getPixelForValue(opts.baseY);
        ctx.strokeStyle = "rgba(214,178,94,0.45)";
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(area.left, by); ctx.lineTo(area.right, by); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.goldPale;
        ctx.font = "500 12px Jost, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Base 2024 = 100", area.left + 8, by - 7);
      }
      // highlighted year
      if (opts.markYear != null) {
        var mx = x.getPixelForValue(opts.markYear);
        ctx.strokeStyle = "rgba(240,217,160,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(mx, area.top); ctx.lineTo(mx, area.bottom); ctx.stroke();
      }
      ctx.restore();
    }
  };

  function baseOptions(yFmt, tooltipLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: REDUCED ? false : { duration: 500 },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 6, right: 6 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#050B17",
          borderColor: "rgba(214,178,94,0.35)",
          borderWidth: 1,
          padding: 12,
          titleColor: C.goldPale,
          bodyColor: C.ivory,
          titleFont: { family: "Jost", weight: "500", size: 13 },
          bodyFont: { family: "Jost", size: 13 },
          boxWidth: 8, boxHeight: 8, boxPadding: 4, usePointStyle: true,
          filter: function (item) { return !item.dataset._band && !(item.dataset._proj && item.label === String(CUR)) && item.raw != null; },
          callbacks: { label: tooltipLabel }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { color: "rgba(174,182,198,0.25)" }, ticks: { color: C.muted, font: { family: "Jost", size: 13 } } },
        y: { grid: { color: C.grid }, border: { display: false }, ticks: { color: C.muted, font: { family: "Jost", size: 12 }, callback: yFmt, maxTicksLimit: 6 } }
      }
    };
  }

  // Split a yearly series into a solid recorded part and a dashed projected part
  function splitSeries(vals) {
    return {
      rec: vals.map(function (v, i) { return isProj(YEARS[i]) ? null : v; }),
      proj: vals.map(function (v, i) { return YEARS[i] >= CUR ? v : null; })
    };
  }
  function seriesPair(label, vals, color, extra) {
    var s = splitSeries(vals);
    var common = { borderColor: color, pointBackgroundColor: color, pointBorderColor: C.deep, pointBorderWidth: 1.5, tension: 0.3, spanGaps: false };
    return [
      Object.assign({ label: label, data: s.rec, borderWidth: 2.4, pointRadius: 3, pointHoverRadius: 5 }, common, extra || {}),
      Object.assign({ label: label, data: s.proj, borderWidth: 2, borderDash: [6, 5], pointRadius: 2.5, pointHoverRadius: 5, _proj: true }, common)
    ];
  }

  /* ================================================================ INDEX SECTION */
  var indexView = "all";

  function renderYearStrip() {
    $("yearStrip").innerHTML = YEARS.map(function (y) {
      var v = allIndia(y), prev = YEARS.indexOf(y) > 0 ? allIndia(y - 1) : null;
      var ch = prev ? (v / prev - 1) * 100 : null;
      var cls = "years__cell" + (y === BASE ? " is-base" : "") + (isProj(y) ? " is-proj" : "");
      var sub = y === BASE ? "Base year" : ch == null ? "First year" : '<span class="' + (ch >= 0 ? "up" : "down") + '">' + pct(ch) + "</span>" + (isProj(y) ? " proj." : "");
      return '<div class="' + cls + '"><span class="years__y">' + y + '</span><span class="years__v">' + fmtIdx(v) + '</span><span class="years__c">' + sub + "</span></div>";
    }).join("");
  }

  function legendHtml(items) {
    return items.map(function (it) {
      if (it.band) return '<span><i class="is-band"></i>' + esc(it.label) + "</span>";
      return '<span><i class="' + (it.dashed ? "is-dashed" : "") + '" style="border-color:' + it.color + '"></i>' + esc(it.label) + "</span>";
    }).join("");
  }

  function renderIndexChart() {
    var datasets = [], legend = [];
    if (indexView === "all") {
      var mid = YEARS.map(function (y) { return allIndia(y); });
      var low = YEARS.map(function (y) { return isProj(y) ? allIndia(y, "low") : y === CUR ? allIndia(y) : null; });
      var high = YEARS.map(function (y) { return isProj(y) ? allIndia(y, "high") : y === CUR ? allIndia(y) : null; });
      datasets.push({ label: "low", data: low, borderWidth: 0, pointRadius: 0, fill: false, _band: true, tension: 0.3 });
      datasets.push({ label: "high", data: high, borderWidth: 0, pointRadius: 0, fill: "-1", backgroundColor: "rgba(174,182,198,0.16)", _band: true, tension: 0.3 });
      var pair = seriesPair("All-India index", mid, C.gold, { fill: "origin", backgroundColor: "rgba(214,178,94,0.07)" });
      pair[1].borderColor = C.silver; pair[1].pointBackgroundColor = C.silver;
      datasets = datasets.concat(pair);
      legend = [{ label: "Recorded", color: C.gold }, { label: "Projected", color: C.silver, dashed: true }, { label: "Likely range", band: true }];
    } else {
      var keys = indexView === "airline" ? META.airlines : HUBS;
      keys.forEach(function (k) {
        var color = indexView === "airline" ? AIRLINE_COLOR[k] : HUB_COLOR[k];
        var vals = YEARS.map(function (y) { return indexView === "airline" ? airlineIndex(k, y) : hubIndex(k, y); });
        var label = indexView === "airline" ? k : k + " hub";
        datasets = datasets.concat(seriesPair(label, vals, color));
        legend.push({ label: label, color: color });
      });
      legend.push({ label: "Dashed after " + CUR + ": projected", color: C.muted, dashed: true });
    }
    $("indexLegend").innerHTML = legendHtml(legend);

    if (!chartReady()) return;
    var opts = baseOptions(function (v) { return v; }, function (ctx) { return " " + ctx.dataset.label + ": " + fmtIdx(ctx.parsed.y); });
    opts.scales.y.suggestedMin = 88;
    opts.scales.y.suggestedMax = 124;
    opts.plugins.alaviaGuides = { baseY: 100, projFrom: String(CUR) };
    if (charts.index) charts.index.destroy();
    charts.index = new Chart($("indexChart"), {
      type: "line",
      data: { labels: YEARS.map(String), datasets: datasets },
      options: opts,
      plugins: [guidesPlugin]
    });
  }

  document.querySelectorAll(".tabs .tab").forEach(function (tab, i, all) {
    tab.addEventListener("click", function () {
      all.forEach(function (t) { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); t.tabIndex = -1; });
      tab.classList.add("is-active"); tab.setAttribute("aria-selected", "true"); tab.tabIndex = 0;
      indexView = tab.dataset.view;
      renderIndexChart();
    });
    tab.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      var next = all[(i + d + all.length) % all.length];
      next.focus(); next.click();
    });
    tab.tabIndex = i === 0 ? 0 : -1;
  });

  $("indexCsv").addEventListener("click", function () {
    var head = ["year", "status", "all_india_index", "one_year_change_pct"]
      .concat(META.airlines.map(function (a) { return "airline_" + a.toLowerCase().replace(/\s+/g, "_"); }))
      .concat(HUBS.map(function (h) { return "hub_" + h.toLowerCase(); }));
    var rows = YEARS.map(function (y, i) {
      var v = allIndia(y), prev = i ? allIndia(y - 1) : null;
      return [y, isProj(y) ? "projected" : "recorded", v.toFixed(2), prev ? ((v / prev - 1) * 100).toFixed(2) : ""]
        .concat(META.airlines.map(function (a) { return airlineIndex(a, y).toFixed(2); }))
        .concat(HUBS.map(function (h) { return hubIndex(h, y).toFixed(2); }));
    });
    download("alavia_airfare_index_base2024.csv", [head].concat(rows));
  });

  /* ================================================================ ROUTE DESK */
  var desk = { route: "Delhi ↔ Mumbai", dir: "", year: CUR, airline: null };
  if (!ROUTE_BY_NAME[desk.route]) desk.route = ROUTES[0].name;

  var rRoute = $("rRoute"), rYear = $("rYear"), rDir = $("rDir"), pAirline = $("pAirline");
  fillSelect(rRoute, ROUTES.slice().sort(function (a, b) { return a.label.localeCompare(b.label); }).map(function (r) { return { value: r.name, text: r.label }; }), desk.route);
  fillSelect(rYear, YEARS.map(function (y) { return { value: y, text: y + (isProj(y) ? " (projected)" : "") }; }), desk.year);

  /* --- map */
  var mapSvg = $("netMap");
  var NS = "http://www.w3.org/2000/svg";
  function proj(c) { return { x: 64 + (c.lon - 70.5) * 19, y: 20 + (30.5 - c.lat) * 19 }; }
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  // With 30 curved routes fanning out from 4 hub airports on a small map,
  // many lines pass close to one another, so a stroke-based invisible
  // "hit area" per route is ambiguous: two routes can overlap enough that
  // clicking what looks like route A's line actually resolves to route B.
  // Instead, every route's curve is sampled into points once at draw time,
  // and a click or hover resolves to whichever route's curve is genuinely
  // *nearest* to the cursor — deterministic, order-independent, and always
  // matches what the eye sees.
  var arcEls = {}, cityEls = {}, arcD = {}, arcSamples = {}, arcsLayer;
  var HOVER_MAX = 16, CLICK_MAX = 20;

  function sampleQuadratic(A, C, B, n) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      pts.push({
        x: u * u * A.x + 2 * u * t * C.x + t * t * B.x,
        y: u * u * A.y + 2 * u * t * C.y + t * t * B.y
      });
    }
    return pts;
  }
  function distToSegment(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len2 = dx * dx + dy * dy;
    var t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    var px = a.x + t * dx, py = a.y + t * dy;
    return Math.hypot(p.x - px, p.y - py);
  }
  function nearestRoute(p, maxDist) {
    var best = null, bestD = maxDist;
    ROUTES.forEach(function (r) {
      var pts = arcSamples[r.name];
      for (var i = 0; i < pts.length - 1; i++) {
        var d = distToSegment(p, pts[i], pts[i + 1]);
        if (d < bestD) { bestD = d; best = r.name; }
      }
    });
    return best;
  }
  function svgPoint(evt) {
    var pt = mapSvg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    var m = mapSvg.getScreenCTM();
    if (!m) return null;
    var p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  (function drawMap() {
    var g = el("g", { class: "map-grid" }, mapSvg);
    for (var lon = 72.5; lon <= 90; lon += 5) { var x = 64 + (lon - 70.5) * 19; el("line", { x1: x, y1: 0, x2: x, y2: 440 }, g); }
    for (var lat = 10; lat <= 30; lat += 5) { var y = 20 + (30.5 - lat) * 19; el("line", { x1: 0, y1: y, x2: 440, y2: y }, g); }

    arcsLayer = el("g", {}, mapSvg);
    ROUTES.forEach(function (r) {
      var A = proj(CITY[r.a]), B = proj(CITY[r.b]);
      var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, len = Math.sqrt(dx * dx + dy * dy);
      var k = 0.14 * len, cx = mx - (dy / len) * k, cy = my + (dx / len) * k;
      var C = { x: cx, y: cy };
      var d = "M" + A.x.toFixed(1) + "," + A.y.toFixed(1) + " Q" + cx.toFixed(1) + "," + cy.toFixed(1) + " " + B.x.toFixed(1) + "," + B.y.toFixed(1);
      arcD[r.name] = d;
      arcSamples[r.name] = sampleQuadratic(A, C, B, 24);
      var arc = el("path", { d: d, class: "map-arc" }, arcsLayer);
      var t = el("title", {}, arc); t.textContent = r.label;
      arcEls[r.name] = arc;
    });

    // A single transparent plane over the whole map resolves all pointer
    // interaction, so exactly one, predictable route wins at every pixel.
    var hitplane = el("rect", { x: 0, y: 0, width: 440, height: 440, class: "map-hitplane" }, mapSvg);
    var hovered = null;
    function setHover(name) {
      if (name === hovered) return;
      if (hovered && arcEls[hovered]) arcEls[hovered].classList.remove("is-hover");
      hovered = name;
      if (hovered && arcEls[hovered]) arcEls[hovered].classList.add("is-hover");
      hitplane.style.cursor = hovered ? "pointer" : "default";
    }
    hitplane.addEventListener("mousemove", function (evt) {
      var p = svgPoint(evt);
      if (p) setHover(nearestRoute(p, HOVER_MAX));
    });
    hitplane.addEventListener("mouseleave", function () { setHover(null); });
    hitplane.addEventListener("click", function (evt) {
      var p = svgPoint(evt);
      if (!p) return;
      var name = nearestRoute(p, CLICK_MAX);
      if (name) openRoute(name, false);
    });

    el("g", { id: "planeLayer" }, mapSvg);
    var cities = el("g", {}, mapSvg);
    Object.keys(CITY).forEach(function (name) {
      var c = CITY[name], p = proj(c);
      var g2 = el("g", { class: "map-city" + (c.hub ? " is-hub" : "") }, cities);
      el("circle", { cx: p.x, cy: p.y, r: c.hub ? 5.5 : 4 }, g2);
      var tx = el("text", { x: p.x + c.lx, y: p.y + c.ly, "text-anchor": c.anchor }, g2);
      tx.textContent = name;
      cityEls[name] = g2;
    });
  })();

  function paintMap() {
    var r = ROUTE_BY_NAME[desk.route];
    Object.keys(arcEls).forEach(function (k) {
      arcEls[k].classList.toggle("is-active", k === desk.route);
      arcEls[k].classList.toggle("is-dim", k !== desk.route);
    });
    arcsLayer.appendChild(arcEls[desk.route]); // draw the selected line last, on top of the dimmed ones
    Object.keys(cityEls).forEach(function (k) { cityEls[k].classList.toggle("is-on", k === r.a || k === r.b); });

    var layer = $("planeLayer");
    layer.innerHTML = "";
    if (!REDUCED) {
      var dot = el("circle", { r: 3.6, class: "map-plane" }, layer);
      var anim = el("animateMotion", { dur: "3.2s", repeatCount: "indefinite", path: arcD[desk.route], calcMode: "linear", keyPoints: desk.dir === "←" ? "1;0" : "0;1", keyTimes: "0;1" }, dot);
      if (anim.beginElement) try { anim.beginElement(); } catch (e) { /* SMIL unavailable */ }
    }
  }

  /* --- direction toggle */
  function paintDirButtons() {
    var r = ROUTE_BY_NAME[desk.route];
    var opts = [{ v: "", t: "Both ways", a: "Both directions" }, { v: "→", t: "To " + r.b, a: r.a + " to " + r.b }, { v: "←", t: "To " + r.a, a: r.b + " to " + r.a }];
    rDir.innerHTML = opts.map(function (o) {
      return '<button type="button" role="radio" aria-checked="' + (desk.dir === o.v) + '" aria-label="' + esc(o.a) + '" title="' + esc(o.a) + '" data-dir="' + o.v + '" tabindex="' + (desk.dir === o.v ? 0 : -1) + '">' + esc(o.t) + "</button>";
    }).join("");
  }
  rDir.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    desk.dir = b.dataset.dir; renderDesk();
    var nb = rDir.querySelector('[data-dir="' + desk.dir + '"]'); if (nb) nb.focus();
  });
  rDir.addEventListener("keydown", function (e) {
    var d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    var order = ["", "→", "←"], i = order.indexOf(desk.dir);
    desk.dir = order[(i + d + 3) % 3]; renderDesk();
    rDir.querySelector('[data-dir="' + desk.dir + '"]').focus();
  });

  rRoute.addEventListener("change", function () { openRoute(rRoute.value, false); });
  rYear.addEventListener("change", function () { desk.year = Number(rYear.value); renderDesk(); });
  pAirline.addEventListener("change", function () { desk.airline = pAirline.value; renderPass(); });

  function openRoute(name, scroll) {
    if (!ROUTE_BY_NAME[name]) return;
    desk.route = name; desk.dir = ""; desk.airline = null;
    rRoute.value = name;
    renderDesk();
    if (scroll) $("routes").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
  }

  function renderDesk() {
    var r = ROUTE_BY_NAME[desk.route], y = desk.year, dir = desk.dir || null;
    paintDirButtons();
    paintMap();

    $("rTitle").textContent = dir === "←" ? r.b + " – " + r.a : r.label;
    var fare = avgFare({ route: r.name, dir: dir }, y);
    var idx = routeIndex(r.name, y, dir);
    var carriers = carriersFor(r.name, y, dir);
    var cheapest = carriers[0];
    $("rFacts").innerHTML =
      "<div><dt>Avg fare, " + y + (isProj(y) ? " (proj.)" : "") + "</dt><dd>" + money(fare) + "</dd></div>" +
      "<div><dt>Index, base 2024</dt><dd>" + fmtIdx(idx) + "</dd></div>" +
      "<div><dt>Cheapest carrier</dt><dd>" + (cheapest ? esc(cheapest.airline) : "n/a") + "</dd></div>";

    // carrier bars
    var max = carriers.length ? carriers[carriers.length - 1].fare : 1;
    $("carrierTitle").textContent = "Carriers, cheapest first, " + y + (isProj(y) ? " (projected)" : "");
    $("carrierList").innerHTML = carriers.map(function (c) {
      var w = Math.max(8, (c.fare / max) * 100);
      return '<li><span class="carriers__name">' + esc(c.airline) + '</span><span class="carriers__bar"><i style="width:' + w.toFixed(1) + '%"></i></span><span class="carriers__val">' + money(c.fare) + "</span></li>";
    }).join("");

    // route chart: one line per airline
    var datasets = [], legend = [];
    META.airlines.forEach(function (a) {
      var vals = YEARS.map(function (yy) { return avgFare({ route: r.name, airline: a, dir: dir }, yy); });
      datasets = datasets.concat(seriesPair(a, vals, AIRLINE_COLOR[a]));
      legend.push({ label: a, color: AIRLINE_COLOR[a] });
    });
    $("routeLegend").innerHTML = legendHtml(legend);
    if (chartReady()) {
      var opts = baseOptions(function (v) { return "₹" + (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k"; }, function (ctx) { return " " + ctx.dataset.label + ": " + money(ctx.parsed.y); });
      opts.plugins.alaviaGuides = { projFrom: String(CUR), markYear: String(y) };
      opts.onClick = function (evt, els, chart) {
        var xs = chart.scales.x, i = Math.round(xs.getValueForPixel(evt.x));
        if (YEARS[i] != null) { desk.year = YEARS[i]; rYear.value = desk.year; renderDesk(); }
      };
      if (charts.route) {
        charts.route.data.datasets = datasets;
        charts.route.options.plugins.alaviaGuides.markYear = String(y);
        charts.route.update();
      } else {
        charts.route = new Chart($("routeChart"), { type: "line", data: { labels: YEARS.map(String), datasets: datasets }, options: opts, plugins: [guidesPlugin] });
      }
    }

    // boarding pass airline list
    if (!desk.airline || !carriers.some(function (c) { return c.airline === desk.airline; })) desk.airline = cheapest ? cheapest.airline : META.airlines[0];
    fillSelect(pAirline, META.airlines.map(function (a) { return { value: a, text: a + " (" + CARRIER[a] + ")" }; }), desk.airline);
    renderPass();
  }

  function renderPass() {
    var r = ROUTE_BY_NAME[desk.route], y = desk.year, dir = desk.dir || null;
    var from = dir === "←" ? r.b : r.a, to = dir === "←" ? r.a : r.b;
    $("passFromCode").textContent = CITY[from].code; $("passFrom").textContent = from;
    $("passToCode").textContent = CITY[to].code; $("passTo").textContent = to;
    $("passYear").textContent = y;
    var f = { route: r.name, airline: desk.airline, dir: dir };
    var fare = avgFare(f, y);
    var st = $("passStatus");
    st.textContent = isProj(y) ? "Projected" : "Recorded";
    st.classList.toggle("is-proj", isProj(y));
    $("passFare").textContent = money(fare);
    var note;
    if (isProj(y)) {
      var s = avgSpread(f, y);
      note = "Likely range " + money(fare - s) + " to " + money(fare + s);
    } else {
      var prev = YEARS.indexOf(y) > 0 ? avgFare(f, y - 1) : null;
      note = (dir ? "One way, recorded average" : "Average of both directions") + (prev ? ". " + pct((fare / prev - 1) * 100) + " on " + (y - 1) : "");
    }
    $("passRange").textContent = note;
  }

  /* ================================================================ LEDGER */
  var ledgerSort = { key: "index", dir: -1 };
  var ledgerHead = document.querySelectorAll("#ledgerTable thead th");

  function sparkline(series) {
    var w = 160, h = 34, lo = 86, hi = 130;
    var pts = series.map(function (v, i) { return [i * (w / (series.length - 1)), h - ((v - lo) / (hi - lo)) * h]; });
    var ci = YEARS.indexOf(CUR);
    var line = function (a) { return a.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(""); };
    var baseY = (h - ((100 - lo) / (hi - lo)) * h).toFixed(1);
    return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true"><path class="s-base" d="M0,' + baseY + "H" + w + '"/><path class="s-act" d="' + line(pts.slice(0, ci + 1)) + '"/><path class="s-proj" d="' + line(pts.slice(ci)) + '"/><circle cx="' + pts[ci][0].toFixed(1) + '" cy="' + pts[ci][1].toFixed(1) + '" r="2.6"/></svg>';
  }

  function renderLedger() {
    var rows = ROUTE_STATS.slice();
    var rankMap = {};
    ROUTE_STATS.slice().sort(function (a, b) { return b.index - a.index; }).forEach(function (s, i) { rankMap[s.route.name] = i + 1; });
    rows.sort(function (a, b) {
      var k = ledgerSort.key;
      var va = k === "route" ? a.route.label : a[k], vb = k === "route" ? b.route.label : b[k];
      if (k === "route") return ledgerSort.dir * va.localeCompare(vb);
      return ledgerSort.dir * (va - vb);
    });
    document.querySelector("#ledgerTable tbody").innerHTML = rows.map(function (s) {
      return '<tr tabindex="0" data-route="' + esc(s.route.name) + '" aria-label="Open ' + esc(s.route.label) + ' in the route view">' +
        '<td><span class="ledger__rank">' + rankMap[s.route.name] + '</span><span class="ledger__route">' + esc(s.route.label) + '</span><span class="ledger__codes">' + s.route.code + "</span></td>" +
        "<td>" + sparkline(s.series) + "</td>" +
        '<td class="num">' + money(s.fare) + "</td>" +
        '<td class="num">' + fmtIdx(s.index) + "</td>" +
        '<td class="num ' + (s.yoy >= 0 ? "up" : "down") + '">' + pct(s.yoy) + "</td>" +
        '<td class="num">' + fmtIdx(s.proj) + "</td></tr>";
    }).join("");
    ledgerHead.forEach(function (th) {
      var b = th.querySelector("button");
      if (b && b.dataset.sort === ledgerSort.key) th.setAttribute("aria-sort", ledgerSort.dir < 0 ? "descending" : "ascending");
      else th.removeAttribute("aria-sort");
    });
  }
  document.querySelector("#ledgerTable thead").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-sort]"); if (!b) return;
    var k = b.dataset.sort;
    ledgerSort = { key: k, dir: ledgerSort.key === k ? -ledgerSort.dir : k === "route" ? 1 : -1 };
    renderLedger();
  });
  var ledgerBody = document.querySelector("#ledgerTable tbody");
  ledgerBody.addEventListener("click", function (e) { var tr = e.target.closest("tr[data-route]"); if (tr) openRoute(tr.dataset.route, true); });
  ledgerBody.addEventListener("keydown", function (e) {
    var tr = e.target.closest("tr[data-route]");
    if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openRoute(tr.dataset.route, true); }
  });

  /* ================================================================ RECORDS EXPLORER */
  var PAGE = 15, ePage = 0;
  var eSearch = $("eSearch"), eYear = $("eYear"), eAirline = $("eAirline"), eType = $("eType");
  fillSelect(eYear, [{ value: "", text: "All years" }].concat(YEARS.map(function (y) { return { value: y, text: String(y) }; })), "");
  fillSelect(eAirline, [{ value: "", text: "All airlines" }].concat(META.airlines.map(function (a) { return { value: a, text: a }; })), "");

  var RECORDS = D.fares.map(function (f) {
    var r = ROUTE_BY_NAME[f.route];
    var from = f.direction === "←" ? r.b : r.a, to = f.direction === "←" ? r.a : r.b;
    return { f: f, route: r.label, dirText: from + " to " + to, code: CITY[from].code + "-" + CITY[to].code, search: (r.label + " " + f.airline + " " + r.code + " " + from + " " + to).toLowerCase() };
  }).sort(function (a, b) {
    return a.route.localeCompare(b.route) || (a.f.direction === b.f.direction ? 0 : a.f.direction === "→" ? -1 : 1) || a.f.airline.localeCompare(b.f.airline) || a.f.year - b.f.year;
  });

  function filteredRecords() {
    var q = eSearch.value.trim().toLowerCase(), y = eYear.value, a = eAirline.value, t = eType.value;
    var terms = q ? q.split(/\s+/) : [];
    return RECORDS.filter(function (r) {
      return (!y || r.f.year === Number(y)) && (!a || r.f.airline === a) && (!t || r.f.type === t) &&
        terms.every(function (w) { return r.search.indexOf(w) !== -1; });
    });
  }
  function renderRecords() {
    var rows = filteredRecords();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    ePage = Math.min(ePage, pages - 1);
    var slice = rows.slice(ePage * PAGE, ePage * PAGE + PAGE);
    document.querySelector("#recordsTable tbody").innerHTML = slice.length ? slice.map(function (r) {
      var proj = r.f.type === "forecast";
      return "<tr><td>" + esc(r.route) + "</td><td>" + esc(r.dirText) + "</td><td>" + esc(r.f.airline) + '</td><td class="num">' + r.f.year +
        '</td><td class="num">' + money(r.f.price) + '</td><td><span class="status' + (proj ? " status--proj" : "") + '">' + (proj ? "Projected" : "Recorded") + "</span></td></tr>";
    }).join("") : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No records match these filters. Clear the search or pick a different year.</td></tr>';
    $("eCount").textContent = rows.length ? "Showing " + (ePage * PAGE + 1) + "–" + (ePage * PAGE + slice.length) + " of " + rows.length.toLocaleString("en-IN") + " records" : "0 records";
    $("ePrev").disabled = ePage === 0;
    $("eNext").disabled = ePage >= pages - 1;
  }
  var searchTimer;
  eSearch.addEventListener("input", function () { clearTimeout(searchTimer); searchTimer = setTimeout(function () { ePage = 0; renderRecords(); }, 150); });
  [eYear, eAirline, eType].forEach(function (s) { s.addEventListener("change", function () { ePage = 0; renderRecords(); }); });
  $("ePrev").addEventListener("click", function () { ePage--; renderRecords(); });
  $("eNext").addEventListener("click", function () { ePage++; renderRecords(); });
  $("eExport").addEventListener("click", function () {
    var rows = filteredRecords().map(function (r) { return [r.route, r.dirText, r.f.airline, r.f.year, r.f.price.toFixed(2), r.f.type === "forecast" ? "projected" : "recorded"]; });
    download("alavia_fare_records.csv", [["route", "direction", "airline", "year", "fare_inr", "status"]].concat(rows));
  });

  function download(name, rows) {
    var csv = rows.map(function (r) { return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(","); }).join("\n");
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ================================================================ BOOT */
  renderYearStrip();
  renderLedger();
  renderRecords();

  function bootCharts() {
    if (chartReady()) {
      Chart.defaults.font.family = "Jost, sans-serif";
      Chart.defaults.color = C.muted;
    }
    renderIndexChart();
    renderDesk();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(bootCharts, bootCharts);
  else bootCharts();
})();
