/*
 * aurora-core.js — shared engine for the Aurora Watch NL dashboard.
 *
 * Runs unchanged in the browser (attaches `window.AuroraCore`) and in Node 18+
 * (`module.exports`), so the page and the daily GitHub Action score nights with
 * exactly the same rules.
 *
 * Everything internal is UTC epoch milliseconds. Formatting for Europe/Amsterdam
 * happens only at render time.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AuroraCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var TZ = 'Europe/Amsterdam';
  var MS_HOUR = 3600000;

  /* ------------------------------------------------------------------ *
   * Observing sites
   *
   * kpCamera — Kp at which a camera (15s, f/2.8, ISO 3200) starts picking up
   *            the glow on the northern horizon from this spot.
   * kpEye    — Kp at which the display becomes plainly naked-eye.
   * Both are lower where the northern horizon is open water and the sky is
   * dark, higher under a city light dome.
   * ------------------------------------------------------------------ */
  var SITES = [
    {
      id: 'lauwersoog',
      name: 'Lauwersmeer / Lauwersoog',
      short: 'Lauwersoog',
      lat: 53.406, lon: 6.208,
      bortle: 4,
      kpCamera: 4.7, kpEye: 6.0,
      region: 'Groningen',
      travel: 'Dark Sky Park, ~2h30 from Amsterdam. Wadden Sea straight to the north.',
      trip: true
    },
    {
      id: 'texel',
      name: 'Texel — De Cocksdorp / De Slufter',
      short: 'Texel',
      lat: 53.172, lon: 4.879,
      bortle: 4,
      kpCamera: 5.0, kpEye: 6.3,
      region: 'Noord-Holland (island)',
      travel: 'Ferry from Den Helder (TESO) + ~20 min drive north. Plan the last boat back, or stay over.',
      trip: true
    },
    {
      id: 'afsluitdijk',
      name: 'Afsluitdijk / Den Oever',
      short: 'Afsluitdijk',
      lat: 52.932, lon: 5.037,
      bortle: 5,
      kpCamera: 5.2, kpEye: 6.5,
      region: 'Noord-Holland',
      travel: '~1h from Amsterdam, no ferry. Wadden Sea to the north, parking on the dike.',
      trip: false
    },
    {
      id: 'callantsoog',
      name: 'Callantsoog / Zwanenwater dunes',
      short: 'Callantsoog',
      lat: 52.842, lon: 4.699,
      bortle: 5,
      kpCamera: 5.3, kpEye: 6.6,
      region: 'Noord-Holland coast',
      travel: '~1h15 from Amsterdam. North Sea to the north-west, dunes block inland glow.',
      trip: false
    },
    {
      id: 'houtribdijk',
      name: 'Houtribdijk (Lelystad — Enkhuizen)',
      short: 'Houtribdijk',
      lat: 52.563, lon: 5.441,
      bortle: 5,
      kpCamera: 5.4, kpEye: 6.7,
      region: 'Flevoland',
      travel: '~45 min from Amsterdam. Markermeer to the north, easy fallback on a work night.',
      trip: false
    },
    {
      id: 'amsterdam',
      name: 'Amsterdam',
      short: 'Amsterdam',
      lat: 52.370, lon: 4.895,
      bortle: 8,
      kpCamera: 5.7, kpEye: 7.0,
      region: 'Noord-Holland',
      travel: 'Step outside. Only the strongest storms beat the city light dome.',
      trip: false,
      home: true
    }
  ];


  /* ------------------------------------------------------------------ *
   * Glossary — the popovers on the dashboard and the reference card at
   * the bottom of the page are both rendered from this.
   * ------------------------------------------------------------------ */
  var GLOSSARY = {
    kp: {
      term: 'Kp index',
      body: 'How hard Earth\u2019s magnetic field is being shaken, on a 0\u20139 scale, averaged from magnetometers around the world. One value every three hours. The higher it goes, the further south the aurora oval is pushed.',
      rule: 'From the Dutch coast a camera starts catching a glow around Kp 5; the naked eye usually needs 6.'
    },
    gscale: {
      term: 'G-scale',
      body: 'NOAA\u2019s geomagnetic storm scale, G1 (minor) to G5 (extreme). It maps onto Kp: G1 = Kp 5, G2 = 6, G3 = 7, G4 = 8, G5 = 9.',
      rule: 'G2 is the level at which the Netherlands starts to be worth a drive.'
    },
    bz: {
      term: 'Bz',
      body: 'The north\u2013south component of the magnetic field carried by the solar wind, in nanotesla. When Bz turns negative (southward) it links up with Earth\u2019s own field and lets energy pour in. Positive Bz keeps the door shut, however fast the wind is blowing.',
      rule: 'Below \u22125 nT held for half an hour means something is starting. \u221215 nT is a serious night.'
    },
    bt: {
      term: 'Bt',
      body: 'Total strength of the interplanetary magnetic field. It sets the ceiling for Bz \u2014 Bz can never be more negative than Bt is strong.',
      rule: 'A high Bt with a northward Bz is loaded potential: if it rotates south, it goes off quickly.'
    },
    speed: {
      term: 'Solar wind speed',
      body: 'How fast the plasma from the sun is arriving, in km/s. Ambient wind is 300\u2013400. Streams from coronal holes run 600\u2013800, and a CME shock can arrive faster still.',
      rule: 'Above 500 km/s the odds improve, but speed without a southward Bz rarely produces anything.'
    },
    density: {
      term: 'Proton density',
      body: 'Protons per cubic centimetre in the solar wind. A denser wind presses harder on the magnetosphere.',
      rule: 'A sudden jump in density and speed together is usually the shock front of a CME arriving.'
    },
    propagated: {
      term: 'Propagated to Earth',
      body: 'The solar wind is measured by a spacecraft at L1, a gravitational balance point 1.5 million km sunward of Earth. NOAA time-shifts those readings for the 25\u201360 minutes the wind takes to cover the rest of the distance.',
      rule: 'So these numbers describe what is hitting the magnetic field about now \u2014 no mental arithmetic needed.'
    },
    oval: {
      term: 'Aurora oval (OVATION)',
      body: 'NOAA\u2019s short-term model of where aurora is being produced right now, as a probability on a map. This dashboard reads the band between 54\u00b0 and 66\u00b0N over the North Sea.',
      rule: 'At Dutch latitudes you are looking at that band low on the horizon, not at the sky above you.'
    },
    substorm: {
      term: 'Substorm',
      body: 'Energy stored in Earth\u2019s magnetotail releasing all at once, over 20 to 60 minutes. The aurora suddenly brightens, structures into rays and moves. This is the part people actually see.',
      rule: 'Kp is a three-hour average and cannot predict substorms, which is why a quiet-looking night can still deliver \u2014 and a promising one can stay flat.'
    },
    darkwindow: {
      term: 'Dark window',
      body: 'The hours when the sun is more than 12\u00b0 below the horizon (nautical darkness) \u2014 dark enough for aurora on the northern horizon. Astronomical darkness is 18\u00b0 below.',
      rule: 'Between mid-May and late July the Netherlands never reaches \u221218\u00b0, and in June barely reaches \u221212\u00b0.'
    },
    moon: {
      term: 'Moon',
      body: 'The illuminated fraction of the disc, and how much of the dark window it spends above the horizon. Moonlight raises the background the aurora has to compete against.',
      rule: 'A real display outshines a full moon; only faint arcs get washed out, so it costs at most 20% of the score here.'
    },
    blocked: {
      term: 'Horizon blocked',
      body: 'How much of the northern horizon the cloud layers cover, weighting low cloud \u00d70.55, mid \u00d70.30 and high \u00d70.15. Fog \u2014 visibility under 2 km \u2014 overrides everything.',
      rule: 'Low cloud is what kills a night: the aurora is 100 km up, so anything below it is a wall. High cirrus only dims it.'
    },
    bortle: {
      term: 'Bortle class',
      body: 'A 1-to-9 scale of light pollution, from a pristine desert sky to the middle of a city. Lauwersoog and Texel sit around 4; Amsterdam is 8.',
      rule: 'It matters most for faint displays, which have to compete with the orange dome over the towns on your northern horizon.'
    },
    score: {
      term: 'Score',
      body: 'One number per site per night: 100 \u00d7 (geomagnetic/100)^0.6 \u00d7 (sky/100)^0.4 \u00d7 darkness \u00d7 moon. A weighted geometric mean, not a sum.',
      rule: 'Because it multiplies, a zero in any ingredient is fatal \u2014 a G4 storm behind solid stratus scores nothing, and a perfectly clear night with no storm scores nothing either.'
    },
    verdict: {
      term: 'Verdict',
      body: 'GO is 70 and above \u2014 conditions line up, go. WATCH is 50\u201369 \u2014 worth looking north and taking a test shot. SLIM is 30\u201349 \u2014 only if a substorm fires. NO is below 30.',
      rule: 'The verdict follows the best of the six sites, not your doorstep.'
    },
    kpneed: {
      term: 'Kp needed here',
      body: 'The Kp at which this particular spot starts to deliver: first for a camera on a tripod, then for the naked eye. It is lower where the sky is dark and the northern horizon is open water, higher under a city light dome.',
      rule: 'Lauwersoog pays off a full Kp point earlier than Amsterdam \u2014 that difference is the whole argument for driving.'
    },
    primewindow: {
      term: 'Prime window',
      body: 'The stretch of the night when the forecast Kp is within 0.7 of its peak and the sky is at least half open.',
      rule: 'If you can only be out for two hours, be out for these.'
    },
    twilight: {
      term: 'Twilight shoulder',
      body: 'The hours either side of the dark window, shown on the timeline but not scored. The sky is still too bright for a faint aurora, though a strong one cuts through.',
      rule: 'In June this is most of the night, which is why summer scores stay low.'
    }
  };

  var ENDPOINTS = {
    kpForecast: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
    kpNow: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
    scales: 'https://services.swpc.noaa.gov/products/noaa-scales.json',
    alerts: 'https://services.swpc.noaa.gov/products/alerts.json',
    // Bz, Bt, speed and density for the last hour, already propagated from L1 to
    // Earth — 7 kB, where the raw RTSW feeds are 1.7 and 2.9 MB.
    wind: 'https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json',
    // Tiny current-value fallbacks if the propagated feed is down.
    windMag: 'https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json',
    windSpeed: 'https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json',
    ovation: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'
  };

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  var RAD = Math.PI / 180;
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function median(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  // NOAA serves "2026-09-12 18:00:00" (UTC, no zone marker).
  function parseUtc(s) {
    if (!s) return NaN;
    var t = String(s).trim().replace(' ', 'T');
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(t)) t += 'Z';
    return Date.parse(t);
  }

  /* ------------------------------------------------------------------ *
   * Astronomy — low-precision formulae, good to a fraction of a degree,
   * which is far better than the weather forecast deserves.
   * ------------------------------------------------------------------ */
  function daysSinceJ2000(ms) { return ms / 86400000 - 10957.5; }

  function siderealTime(d, lonDeg) { // degrees
    return (280.16 + 360.9856235 * d + lonDeg) % 360;
  }

  function eclipticToAltAz(lonDeg, latDeg, d, obsLat, obsLon) {
    var e = 23.4397 * RAD;
    var l = lonDeg * RAD, b = latDeg * RAD;
    var ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
    var dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
    var H = siderealTime(d, obsLon) * RAD - ra;
    var phi = obsLat * RAD;
    var alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    return { ra: ra, dec: dec, alt: alt / RAD, H: H };
  }

  function sunEcliptic(d) {
    var M = (357.5291 + 0.98560028 * d) * RAD;
    var C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
    var P = 102.9372 * RAD;
    var L = M + C + P + Math.PI;
    return { lon: (L / RAD) % 360, lat: 0, M: M };
  }

  // Sun altitude in degrees.
  function sunAltitude(ms, lat, lon) {
    var d = daysSinceJ2000(ms);
    var s = sunEcliptic(d);
    return eclipticToAltAz(s.lon, 0, d, lat, lon).alt;
  }

  function sunEquatorial(ms) {
    var d = daysSinceJ2000(ms);
    var s = sunEcliptic(d);
    var p = eclipticToAltAz(s.lon, 0, d, 0, 0);
    return { ra: p.ra, dec: p.dec };
  }

  // Moon position + illuminated fraction (Meeus, low-precision terms).
  function moonState(ms, lat, lon) {
    var d = daysSinceJ2000(ms);
    var L = (218.316 + 13.176396 * d) * RAD;
    var M = (134.963 + 13.064993 * d) * RAD;
    var F = (93.272 + 13.229350 * d) * RAD;
    var lonEc = (L + 6.289 * RAD * Math.sin(M)) / RAD;
    var latEc = 5.128 * Math.sin(F);
    var dist = 385001 - 20905 * Math.cos(M);
    var p = eclipticToAltAz(lonEc, latEc, d, lat, lon);
    var sun = sunEquatorial(ms);
    var sdist = 149598000;
    var phi = Math.acos(clamp(
      Math.sin(sun.dec) * Math.sin(p.dec) + Math.cos(sun.dec) * Math.cos(p.dec) * Math.cos(sun.ra - p.ra),
      -1, 1));
    var inc = Math.atan2(sdist * Math.sin(phi), dist - sdist * Math.cos(phi));
    return {
      altitude: p.alt,
      fraction: (1 + Math.cos(inc)) / 2,
      distance: dist
    };
  }

  /* ------------------------------------------------------------------ *
   * Night windows
   *
   * A "night" runs from 12:00 local on its date to 12:00 local the next day.
   * Dark = sun below -12° (nautical). Astronomical dark = below -18°.
   * In NL the second one simply does not exist from mid-May to late July.
   * ------------------------------------------------------------------ */
  function tzOffsetMs(ms, tz) {
    // Offset of `tz` at instant `ms`, derived from formatted parts.
    var dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    var p = {};
    dtf.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - Math.floor(ms / 1000) * 1000;
  }

  function localDateKey(ms, tz) {
    var dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    });
    return dtf.format(new Date(ms));
  }

  // 12:00 local on the given local date key, as epoch ms.
  function localNoonMs(dateKey, tz) {
    var parts = dateKey.split('-').map(Number);
    var guess = Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    var off = tzOffsetMs(guess, tz || TZ);
    return guess - off;
  }

  function nightWindow(dateKey, lat, lon, tz) {
    var start = localNoonMs(dateKey, tz);
    var end = start + 24 * MS_HOUR;
    var step = 10 * 60000; // 10-minute sampling
    var dark = null, astro = null, prevAlt = null;
    var darkHours = 0, astroHours = 0;
    for (var t = start; t <= end; t += step) {
      var alt = sunAltitude(t, lat, lon);
      if (alt < -12) {
        if (!dark) dark = { start: t, end: t };
        dark.end = t;
        darkHours += step / MS_HOUR;
      }
      if (alt < -18) {
        if (!astro) astro = { start: t, end: t };
        astro.end = t;
        astroHours += step / MS_HOUR;
      }
      prevAlt = alt;
    }
    // Fall back to civil/nautical twilight for the bright weeks of summer.
    var twilightOnly = false;
    if (!dark) {
      twilightOnly = true;
      for (var t2 = start; t2 <= end; t2 += step) {
        if (sunAltitude(t2, lat, lon) < -6) {
          if (!dark) dark = { start: t2, end: t2 };
          dark.end = t2;
        }
      }
    }
    if (!dark) dark = { start: start + 10 * MS_HOUR, end: start + 16 * MS_HOUR };
    var mid = (dark.start + dark.end) / 2;
    var moonMid = moonState(mid, lat, lon);
    var upSamples = 0, total = 0;
    for (var t3 = dark.start; t3 <= dark.end; t3 += step) {
      total++;
      if (moonState(t3, lat, lon).altitude > 0) upSamples++;
    }
    return {
      dateKey: dateKey,
      start: dark.start,
      end: dark.end,
      darkHours: darkHours,
      astroHours: astroHours,
      astro: astro,
      twilightOnly: twilightOnly,
      moonFraction: moonMid.fraction,
      moonUpFraction: total ? upSamples / total : 0,
      moonAltitude: moonMid.altitude
    };
  }

  /* ------------------------------------------------------------------ *
   * Fetching
   * ------------------------------------------------------------------ */
  function getJson(url, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 20000) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) { if (timer) clearTimeout(timer); return j; },
            function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function weatherUrl(sites, days) {
    var lats = sites.map(function (s) { return s.lat; }).join(',');
    var lons = sites.map(function (s) { return s.lon; }).join(',');
    return 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + lats + '&longitude=' + lons
      + '&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,'
      + 'visibility,temperature_2m,wind_speed_10m,precipitation_probability,relative_humidity_2m'
      + '&timezone=UTC&forecast_days=' + (days || 5);
  }

  // SWPC serves two shapes: a header row followed by data rows, or a plain array
  // of objects. Normalise both to objects.
  function rowsToObjects(raw) {
    if (!Array.isArray(raw) || !raw.length) return [];
    if (!Array.isArray(raw[0])) return raw.filter(function (r) { return r && typeof r === 'object'; });
    if (raw.length < 2) return [];
    var head = raw[0];
    return raw.slice(1).map(function (row) {
      var o = {};
      for (var i = 0; i < head.length; i++) o[head[i]] = row[i];
      return o;
    });
  }

  function parseKpForecast(raw) {
    return rowsToObjects(raw).map(function (r) {
      return {
        t: parseUtc(r.time_tag),
        kp: num(r.kp),
        observed: (r.observed || '').toLowerCase(),
        scale: r.noaa_scale || null
      };
    }).filter(function (r) { return isFinite(r.t) && r.kp !== null; })
      .sort(function (a, b) { return a.t - b.t; });
  }

  function parseSolarWind(raw, magSummary, speedSummary) {
    var rows = rowsToObjects(raw).map(function (r) {
      // propagated_time_tag is when this parcel reaches Earth; that is the clock
      // the sky runs on, so plot against it when it is there.
      var t = parseUtc(r.propagated_time_tag || r.time_tag);
      return {
        t: t,
        bz: num(r.bz),
        bt: num(r.bt),
        speed: num(r.speed),
        density: num(r.density),
        measuredAt: parseUtc(r.time_tag)
      };
    }).filter(function (r) { return isFinite(r.t); })
      .sort(function (a, b) { return a.t - b.t; });

    function lastValid(key) {
      for (var i = rows.length - 1; i >= 0; i--) if (rows[i][key] !== null) return rows[i];
      return null;
    }
    var lb = lastValid('bz'), lp = lastValid('speed');
    var newest = rows.length ? rows[rows.length - 1] : null;
    var cutoff = (newest ? newest.t : Date.now()) - 30 * 60000;
    var recentBz = rows.filter(function (r) { return r.t >= cutoff && r.bz !== null; })
                       .map(function (r) { return r.bz; });

    var out = {
      series: rows.filter(function (r) { return r.bz !== null; }),
      bz: lb ? lb.bz : null,
      bt: lb ? lb.bt : null,
      bzMean30: recentBz.length ? recentBz.reduce(function (a, b) { return a + b; }, 0) / recentBz.length : null,
      speed: lp ? lp.speed : null,
      density: lp ? lp.density : null,
      time: newest ? newest.t : null,
      measuredAt: newest ? newest.measuredAt : null,
      propagated: !!(newest && newest.measuredAt && newest.measuredAt !== newest.t)
    };

    // Current values only, when the hourly table is unavailable.
    if (out.bz === null && Array.isArray(magSummary) && magSummary.length) {
      var m = magSummary[magSummary.length - 1];
      out.bz = num(m.bz_gsm); out.bt = num(m.bt);
      out.bzMean30 = out.bz;
      out.time = out.time || parseUtc(m.time_tag);
    }
    if (out.speed === null && Array.isArray(speedSummary) && speedSummary.length) {
      var sp = speedSummary[speedSummary.length - 1];
      out.speed = num(sp.proton_speed);
      out.time = out.time || parseUtc(sp.time_tag);
    }
    return out;
  }

  // Current NOAA scales: {"0": {G: {Scale, Text}, ...}, "1": ...}
  function parseScales(raw) {
    if (!raw || typeof raw !== 'object' || !raw['0'] || !raw['0'].G) return null;
    var g = raw['0'].G;
    return {
      g: g.Scale === null || g.Scale === undefined ? null : parseInt(g.Scale, 10),
      text: g.Text || null,
      at: raw['0'].DateStamp ? parseUtc(raw['0'].DateStamp + ' ' + (raw['0'].TimeStamp || '00:00:00')) : null
    };
  }

  function parseKpNow(raw) {
    if (!Array.isArray(raw) || !raw.length) return null;
    var last = raw[raw.length - 1];
    var kp = num(last.estimated_kp !== undefined && last.estimated_kp !== null ? last.estimated_kp : last.kp_index);
    return { kp: kp, t: parseUtc(last.time_tag) };
  }

  function parseAlerts(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (a) {
      var msg = String(a.message || '');
      var first = msg.split('\n').filter(function (l) { return l.trim(); })[0] || '';
      return {
        id: a.product_id,
        issued: parseUtc(a.issue_datetime),
        headline: (msg.match(/(?:CONTINUED |EXTENDED |CANCEL )?(?:ALERT|WARNING|WATCH|SUMMARY)\s*:[^\n\r]*/) || [first])[0].trim(),
        message: msg
      };
    }).filter(function (a) {
      // Geomagnetic business only — no radio blackout / radiation storm noise.
      return /geomagnetic|K-index|Kp|aurora|storm/i.test(a.message);
    }).sort(function (a, b) { return b.issued - a.issued; });
  }

  // Max OVATION aurora probability in the band straight north of the Netherlands.
  function parseOvation(raw) {
    if (!raw || !Array.isArray(raw.coordinates)) return null;
    var best = 0, overhead = 0;
    for (var i = 0; i < raw.coordinates.length; i++) {
      var c = raw.coordinates[i];
      var lon = c[0] > 180 ? c[0] - 360 : c[0];
      var lat = c[1], p = c[2];
      if (lon < -2 || lon > 12) continue;
      if (lat >= 54 && lat <= 66 && p > best) best = p;
      if (lat >= 51 && lat <= 54 && p > overhead) overhead = p;
    }
    return {
      north: best,
      overhead: overhead,
      forecastTime: raw['Forecast Time'] ? parseUtc(raw['Forecast Time']) : null
    };
  }

  function fetchAll(opts) {
    opts = opts || {};
    var sites = opts.sites || SITES;
    var want = {
      kpForecast: ENDPOINTS.kpForecast,
      kpNow: ENDPOINTS.kpNow,
      alerts: ENDPOINTS.alerts,
      wind: ENDPOINTS.wind,
      windMag: ENDPOINTS.windMag,
      windSpeed: ENDPOINTS.windSpeed,
      scales: ENDPOINTS.scales,
      weather: weatherUrl(sites, opts.days || 5)
    };
    if (opts.ovation !== false) want.ovation = ENDPOINTS.ovation;
    var keys = Object.keys(want);
    var errors = {};
    return Promise.all(keys.map(function (k) {
      return getJson(want[k], opts.timeout).catch(function (e) {
        errors[k] = e.message || String(e);
        return null;
      });
    })).then(function (results) {
      var raw = {};
      keys.forEach(function (k, i) { raw[k] = results[i]; });
      return {
        fetchedAt: Date.now(),
        errors: errors,
        kpForecast: raw.kpForecast ? parseKpForecast(raw.kpForecast) : [],
        kpNow: raw.kpNow ? parseKpNow(raw.kpNow) : null,
        alerts: raw.alerts ? parseAlerts(raw.alerts) : [],
        wind: parseSolarWind(raw.wind || [], raw.windMag, raw.windSpeed),
        scales: raw.scales ? parseScales(raw.scales) : null,
        ovation: raw.ovation ? parseOvation(raw.ovation) : null,
        weather: normaliseWeather(raw.weather, sites)
      };
    });
  }

  function normaliseWeather(raw, sites) {
    var out = {};
    if (!raw) return out;
    var list = Array.isArray(raw) ? raw : [raw];
    list.forEach(function (w, i) {
      var site = sites[i];
      if (!site || !w || !w.hourly || !w.hourly.time) return;
      var h = w.hourly;
      var rows = h.time.map(function (t, j) {
        return {
          t: parseUtc(t),
          total: h.cloud_cover ? h.cloud_cover[j] : null,
          low: h.cloud_cover_low ? h.cloud_cover_low[j] : null,
          mid: h.cloud_cover_mid ? h.cloud_cover_mid[j] : null,
          high: h.cloud_cover_high ? h.cloud_cover_high[j] : null,
          visibility: h.visibility ? h.visibility[j] : null,
          temp: h.temperature_2m ? h.temperature_2m[j] : null,
          wind: h.wind_speed_10m ? h.wind_speed_10m[j] : null,
          precip: h.precipitation_probability ? h.precipitation_probability[j] : null,
          humidity: h.relative_humidity_2m ? h.relative_humidity_2m[j] : null
        };
      }).filter(function (r) { return isFinite(r.t); });
      out[site.id] = rows;
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Scoring
   * ------------------------------------------------------------------ */

  // What the northern horizon is actually blocked by. Low cloud is the killer;
  // high cirrus only dims an aurora.
  function obstruction(row) {
    if (!row) return null;
    var low = row.low !== null && row.low !== undefined ? row.low : row.total;
    var mid = row.mid !== null && row.mid !== undefined ? row.mid : row.total;
    var high = row.high !== null && row.high !== undefined ? row.high : 0;
    if (low === null || low === undefined) return null;
    var o = 0.55 * low + 0.30 * mid + 0.15 * high;
    // Fog / very poor visibility kills it regardless of what the cloud layers say.
    if (row.visibility !== null && row.visibility !== undefined && row.visibility < 2000) o = Math.max(o, 90);
    return clamp(o, 0, 100);
  }

  function kpAt(forecast, t) {
    var best = null;
    for (var i = 0; i < forecast.length; i++) {
      var f = forecast[i];
      // Each row covers the 3-hour block that starts at its time_tag.
      if (t >= f.t && t < f.t + 3 * MS_HOUR) return f;
      if (f.t <= t) best = f;
    }
    return best && (t - best.t) < 6 * MS_HOUR ? best : null;
  }

  function geoScore(kp, site) {
    var lo = site.kpCamera - 1.0;
    var hi = site.kpEye + 1.0;
    return clamp((kp - lo) / (hi - lo), 0, 1) * 100;
  }

  function scoreSiteNight(site, win, weatherRows, forecast) {
    // Plot two hours of shoulder either side of darkness; score only the dark part.
    var hours = [];
    var pad = 2 * MS_HOUR;
    for (var t = Math.ceil((win.start - pad) / MS_HOUR) * MS_HOUR; t <= win.end + pad; t += MS_HOUR) {
      var row = null;
      for (var i = 0; i < weatherRows.length; i++) {
        if (weatherRows[i].t === t) { row = weatherRows[i]; break; }
      }
      var f = kpAt(forecast, t);
      hours.push({
        t: t,
        dark: t >= win.start && t <= win.end,
        kp: f ? f.kp : null,
        kpObserved: f ? f.observed === 'observed' : false,
        cloud: row,
        obstruction: obstruction(row)
      });
    }
    var darkRows = hours.filter(function (h) { return h.dark; });
    if (!darkRows.length) darkRows = hours;
    var kps = darkRows.map(function (h) { return h.kp; }).filter(function (v) { return v !== null; });
    var obs = darkRows.map(function (h) { return h.obstruction; }).filter(function (v) { return v !== null; });

    var kpMax = kps.length ? Math.max.apply(null, kps) : null;
    var geo = kpMax === null ? 0 : geoScore(kpMax, site);

    var sky = null;
    if (obs.length) {
      var best = Math.min.apply(null, obs);
      var med = median(obs);
      sky = 100 - (0.55 * best + 0.45 * med);
    }
    var skyScore = sky === null ? 50 : clamp(sky, 0, 100); // no data → neutral

    var darkFactor = clamp(0.45 + 0.55 * Math.min(win.darkHours, 3) / 3, 0, 1);
    var moonFactor = 1 - 0.20 * win.moonFraction * win.moonUpFraction;

    var total = 100
      * Math.pow(geo / 100, 0.6)
      * Math.pow(skyScore / 100, 0.4)
      * darkFactor * moonFactor;

    // Best contiguous stretch: the hours that are both dark and least blocked,
    // while Kp is within 0.7 of the night's peak.
    var window_ = null;
    if (kpMax !== null) {
      var good = darkRows.filter(function (h) {
        return h.kp !== null && h.kp >= kpMax - 0.7
          && (h.obstruction === null || h.obstruction <= 55);
      });
      if (good.length) window_ = { start: good[0].t, end: good[good.length - 1].t + MS_HOUR };
    }

    return {
      siteId: site.id,
      site: site,
      score: Math.round(total),
      window: {
        start: win.start, end: win.end,
        darkHours: win.darkHours, astroHours: win.astroHours,
        moonFraction: win.moonFraction, moonUpFraction: win.moonUpFraction,
        twilightOnly: win.twilightOnly
      },
      geoScore: Math.round(geo),
      skyScore: Math.round(skyScore),
      kpMax: kpMax,
      cloudBest: obs.length ? Math.round(Math.min.apply(null, obs)) : null,
      cloudMedian: obs.length ? Math.round(median(obs)) : null,
      hasWeather: obs.length > 0,
      bestWindow: window_,
      hours: hours,
      darkFactor: darkFactor,
      moonFactor: moonFactor
    };
  }

  var VERDICTS = [
    { min: 70, key: 'go',     label: 'GO',     blurb: 'Conditions line up. Pack the camera.' },
    { min: 50, key: 'watch',  label: 'WATCH',  blurb: 'Worth a look north and a test shot.' },
    { min: 30, key: 'slim',   label: 'SLIM',   blurb: 'Only if a substorm fires. Keep an eye on Bz.' },
    { min: 0,  key: 'no',     label: 'NO',     blurb: 'Not tonight.' }
  ];

  function verdictFor(score) {
    for (var i = 0; i < VERDICTS.length; i++) if (score >= VERDICTS[i].min) return VERDICTS[i];
    return VERDICTS[VERDICTS.length - 1];
  }

  function buildNights(data, opts) {
    opts = opts || {};
    var sites = opts.sites || SITES;
    var tz = opts.tz || TZ;
    var nights = [];
    var now = opts.now || Date.now();
    var count = opts.nights || 3;
    // If it is already past midnight but still dark, "tonight" is the night
    // that started yesterday.
    var anchor = now;
    var hourLocal = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(now)), 10);
    if (hourLocal < 12) anchor = now - 24 * MS_HOUR;

    for (var n = 0; n < count; n++) {
      var dateKey = localDateKey(anchor + n * 24 * MS_HOUR, tz);
      var refSite = sites[0];
      var win = nightWindow(dateKey, refSite.lat, refSite.lon, tz);
      var scored = sites.map(function (s) {
        var w = nightWindow(dateKey, s.lat, s.lon, tz);
        return scoreSiteNight(s, w, (data.weather && data.weather[s.id]) || [], data.kpForecast || []);
      });
      scored.sort(function (a, b) { return b.score - a.score; });
      var best = scored[0];
      win = best.window;
      var home = scored.filter(function (s) { return s.site.home; })[0] || null;
      var tripBest = scored.filter(function (s) { return s.site.trip; })[0] || null;

      var tripWorthIt = !!(tripBest && home
        && tripBest.score >= 55
        && tripBest.score - home.score >= 12);

      nights.push({
        dateKey: dateKey,
        index: n,
        window: win,
        sites: scored,
        best: best,
        home: home,
        tripBest: tripBest,
        tripWorthIt: tripWorthIt,
        verdict: verdictFor(best.score),
        kpMax: best.kpMax
      });
    }
    return nights;
  }

  /* ------------------------------------------------------------------ *
   * Right-now assessment (solar wind is only useful on a ~30-60 min horizon)
   * ------------------------------------------------------------------ */
  function nowcast(data, site, now) {
    now = now || Date.now();
    site = site || SITES[0];
    var w = data.wind || {};
    var kp = data.kpNow ? data.kpNow.kp : null;
    var bz = w.bzMean30 !== null && w.bzMean30 !== undefined ? w.bzMean30 : w.bz;
    var alt = sunAltitude(now, site.lat, site.lon);
    var reasons = [];
    var score = 0;

    if (kp !== null) {
      score += geoScore(kp, site) * 0.5;
      reasons.push('Kp now ' + kp.toFixed(1));
    }
    if (bz !== null && bz !== undefined) {
      // Southward Bz is what opens the door. -5 nT matters, -15 nT is a lot.
      var bzPts = clamp((-bz - 2) / 13, 0, 1) * 100;
      score += bzPts * 0.3;
      reasons.push('Bz ' + bz.toFixed(1) + ' nT ' + (bz < 0 ? '(south — good)' : '(north — closed)'));
    }
    if (w.speed) {
      var spPts = clamp((w.speed - 350) / 400, 0, 1) * 100;
      score += spPts * 0.1;
      reasons.push('wind ' + Math.round(w.speed) + ' km/s');
    }
    if (data.ovation) {
      score += clamp(data.ovation.north / 60, 0, 1) * 100 * 0.1;
      reasons.push('oval ' + Math.round(data.ovation.north) + '% to the north');
    }
    var dark = alt < -12;
    return {
      score: Math.round(score),
      dark: dark,
      sunAltitude: alt,
      kp: kp,
      bz: bz,
      reasons: reasons,
      live: dark && score >= 55
    };
  }

  /* ------------------------------------------------------------------ *
   * Plain-language summary — the "tell me when it aligns" line.
   * ------------------------------------------------------------------ */
  function fmtTime(ms, tz) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || TZ, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(ms));
  }
  function fmtNightLabel(dateKey, index, tz) {
    if (index === 0) return 'Tonight';
    if (index === 1) return 'Tomorrow night';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || TZ, weekday: 'long', day: 'numeric', month: 'short'
    }).format(new Date(localNoonMs(dateKey, tz || TZ)));
  }

  function fmtDate(dateKey, tz) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    }).format(new Date(localNoonMs(dateKey, tz || TZ)));
  }

  function summarise(nights, tz) {
    tz = tz || TZ;
    var alert = nights.filter(function (n) { return n.best.score >= 65; })[0];
    var lead = nights[0];
    var parts = [];
    if (alert) {
      var w = alert.best.bestWindow;
      parts.push(fmtNightLabel(alert.dateKey, alert.index, tz) + ': ' + alert.verdict.label
        + ' — ' + alert.best.site.short
        + ' scores ' + alert.best.score + '/100'
        + (alert.best.kpMax !== null ? ' (Kp ' + alert.best.kpMax.toFixed(1) : ' (')
        + ', ' + (alert.best.cloudBest !== null ? alert.best.cloudBest + '% blocked at best' : 'cloud unknown') + ')'
        + (w ? ', best ' + fmtTime(w.start, tz) + '–' + fmtTime(w.end, tz) : '') + '.');
      if (alert.tripWorthIt) {
        parts.push('The drive is worth it: ' + alert.tripBest.site.short + ' beats '
          + (alert.home ? alert.home.site.short : 'home') + ' by '
          + (alert.tripBest.score - (alert.home ? alert.home.score : 0)) + ' points.');
      }
    } else {
      parts.push(fmtNightLabel(lead.dateKey, lead.index, tz) + ': ' + lead.verdict.label
        + ' — best is ' + lead.best.site.short + ' at ' + lead.best.score + '/100'
        + (lead.best.kpMax !== null ? ', Kp peaks at ' + lead.best.kpMax.toFixed(1) : '') + '.');
    }
    return { alert: !!alert, night: alert || lead, text: parts.join(' ') };
  }


  /* ------------------------------------------------------------------ *
   * Snapshot rehydration — data/latest.json is written slim by the daily
   * job; this puts back the shape the page renders from.
   * ------------------------------------------------------------------ */
  function rehydrateSnapshot(s) {
    if (!s || !Array.isArray(s.nights)) return s;
    s.nights.forEach(function (n) {
      n.sites.forEach(function (site) {
        site.hours = (site.hours || []).map(function (h) {
          var c = h.cloud || null;
          return {
            t: h.t,
            kp: h.kp === undefined ? null : h.kp,
            kpObserved: !!h.obs,
            dark: h.d === undefined ? true : !!h.d,
            obstruction: h.ob === undefined ? null : h.ob,
            cloud: c ? {
              total: c.total === undefined ? null : c.total,
              low: c.low === undefined ? null : c.low,
              mid: c.mid === undefined ? null : c.mid,
              high: c.high === undefined ? null : c.high,
              temp: c.temp === undefined ? null : c.temp,
              wind: c.wind === undefined ? null : c.wind,
              visibility: null, precip: null, humidity: null
            } : null
          };
        });
      });
      n.sites.sort(function (a, b) { return b.score - a.score; });
      n.best = n.sites[0];
      n.home = n.sites.filter(function (x) { return x.site && x.site.home; })[0] || null;
      n.tripBest = n.sites.filter(function (x) { return x.site && x.site.trip; })[0] || null;
      n.verdict = n.verdict || verdictFor(n.best.score);
      n.kpMax = n.best.kpMax;
    });
    return s;
  }

  return {
    VERSION: VERSION,
    TZ: TZ,
    SITES: SITES,
    GLOSSARY: GLOSSARY,
    ENDPOINTS: ENDPOINTS,
    VERDICTS: VERDICTS,
    // astronomy
    sunAltitude: sunAltitude,
    moonState: moonState,
    nightWindow: nightWindow,
    localDateKey: localDateKey,
    localNoonMs: localNoonMs,
    // data
    fetchAll: fetchAll,
    weatherUrl: weatherUrl,
    parseKpForecast: parseKpForecast,
    parseSolarWind: parseSolarWind,
    parseScales: parseScales,
    parseOvation: parseOvation,
    // scoring
    obstruction: obstruction,
    kpAt: kpAt,
    geoScore: geoScore,
    scoreSiteNight: scoreSiteNight,
    buildNights: buildNights,
    verdictFor: verdictFor,
    nowcast: nowcast,
    summarise: summarise,
    rehydrateSnapshot: rehydrateSnapshot,
    fmtTime: fmtTime,
    fmtNightLabel: fmtNightLabel,
    fmtDate: fmtDate
  };
});
