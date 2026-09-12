#!/usr/bin/env node
/*
 * check-aurora.js — the daily half of the dashboard.
 *
 * Fetches the same feeds the page does, scores the next three nights with the
 * same engine, writes data/latest.json (the page's offline fallback) and tells
 * the GitHub Action whether tonight is worth an issue.
 *
 *   node scripts/check-aurora.js
 *   node scripts/check-aurora.js --threshold 60   # alert more eagerly
 */
'use strict';

const fs = require('fs');
const path = require('path');
const A = require(path.join(__dirname, '..', 'assets', 'aurora-core.js'));

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'latest.json');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const THRESHOLD = parseFloat(arg('threshold', '65'));
const LOOKAHEAD = parseInt(arg('nights', '3'), 10);

const r1 = (v) => (v === null || v === undefined || !isFinite(v) ? null : Math.round(v * 10) / 10);

// Keep the committed snapshot small: round everything, drop empty cloud fields.
function slimHour(h) {
  const c = h.cloud || {};
  const o = { t: h.t, kp: r1(h.kp), ob: h.obstruction === null ? null : Math.round(h.obstruction) };
  if (h.kpObserved) o.obs = 1;
  if (h.dark) o.d = 1;
  const cl = {};
  ['total', 'low', 'mid', 'high'].forEach((k) => { if (c[k] !== null && c[k] !== undefined) cl[k] = Math.round(c[k]); });
  if (c.temp !== null && c.temp !== undefined) cl.temp = r1(c.temp);
  if (c.wind !== null && c.wind !== undefined) cl.wind = Math.round(c.wind);
  if (Object.keys(cl).length) o.cloud = cl;
  return o;
}

function slimNight(n) {
  return {
    dateKey: n.dateKey,
    index: n.index,
    window: {
      start: n.window.start, end: n.window.end,
      darkHours: r1(n.window.darkHours), astroHours: r1(n.window.astroHours),
      moonFraction: r1(n.window.moonFraction * 100) / 100,
      moonUpFraction: r1(n.window.moonUpFraction * 100) / 100,
      twilightOnly: n.window.twilightOnly
    },
    verdict: n.verdict,
    tripWorthIt: n.tripWorthIt,
    sites: n.sites.map((s) => ({
      siteId: s.siteId, site: s.site, score: s.score,
      geoScore: s.geoScore, skyScore: s.skyScore,
      kpMax: r1(s.kpMax), cloudBest: s.cloudBest, cloudMedian: s.cloudMedian,
      hasWeather: s.hasWeather, bestWindow: s.bestWindow,
      window: {
        start: s.window.start, end: s.window.end,
        darkHours: r1(s.window.darkHours), astroHours: r1(s.window.astroHours),
        moonFraction: r1(s.window.moonFraction * 100) / 100,
        moonUpFraction: r1(s.window.moonUpFraction * 100) / 100,
        twilightOnly: s.window.twilightOnly
      },
      hours: s.hours.map(slimHour)
    }))
  };
}

function ghOutput(kv) {
  const f = process.env.GITHUB_OUTPUT;
  if (!f) return;
  const lines = Object.keys(kv).map((k) => {
    const v = String(kv[k]);
    if (v.includes('\n')) {
      const d = 'EOF_' + Math.random().toString(36).slice(2);
      return `${k}<<${d}\n${v}\n${d}`;
    }
    return `${k}=${v}`;
  });
  fs.appendFileSync(f, lines.join('\n') + '\n');
}

function issueBody(nights, summary) {
  const L = [];
  L.push(`**${summary.text}**`, '');
  L.push('| Night | Verdict | Score | Kp peak | Best site | Blocked at best | Prime window |');
  L.push('|---|---|---:|---:|---|---:|---|');
  nights.forEach((n) => {
    const b = n.best;
    const w = b.bestWindow;
    L.push(`| ${A.fmtNightLabel(n.dateKey, n.index, A.TZ)} (${n.dateKey}) | ${n.verdict.label} | ${b.score} | ${b.kpMax === null ? '—' : b.kpMax.toFixed(1)} | ${b.site.short} | ${b.cloudBest === null ? '—' : b.cloudBest + '%'} | ${w ? A.fmtTime(w.start, A.TZ) + '–' + A.fmtTime(w.end, A.TZ) : '—'} |`);
  });
  const n0 = nights.find((n) => n.best.score >= THRESHOLD) || nights[0];
  L.push('', `### ${A.fmtNightLabel(n0.dateKey, n0.index, A.TZ)}, site by site`, '');
  L.push('| Site | Score | Kp cam / eye | Blocked at best | Dark window |');
  L.push('|---|---:|---:|---:|---|');
  n0.sites.forEach((s) => {
    L.push(`| ${s.site.short} | ${s.score} | ${s.site.kpCamera.toFixed(1)} / ${s.site.kpEye.toFixed(1)} | ${s.cloudBest === null ? '—' : s.cloudBest + '%'} | ${A.fmtTime(s.window.start, A.TZ)}–${A.fmtTime(s.window.end, A.TZ)} |`);
  });
  const w0 = n0.window;
  L.push('', `Moon ${Math.round(w0.moonFraction * 100)}% illuminated, up for ${Math.round(w0.moonUpFraction * 100)}% of the dark window. ` +
    `${w0.darkHours ? w0.darkHours.toFixed(1) + ' h below −12°' : 'No nautical darkness'}${w0.astroHours ? `, ${w0.astroHours.toFixed(1)} h below −18°` : ''}.`);
  if (n0.tripWorthIt && n0.tripBest) {
    L.push('', `**Worth the drive:** ${n0.tripBest.site.name} — ${n0.tripBest.site.travel}`);
  }
  L.push('', '_Kp forecasts are 3-hour planetary averages; substorms fire on their own schedule. Check Bz on the dashboard before you leave._');
  return L.join('\n');
}

(async function main() {
  const data = await A.fetchAll({ sites: A.SITES, days: 5 });
  const failed = Object.keys(data.errors || {});
  if (failed.length) console.warn('Feeds that failed: ' + failed.map((k) => `${k} (${data.errors[k]})`).join('; '));
  if (!data.kpForecast.length) {
    console.error('No Kp forecast available — refusing to write a snapshot.');
    ghOutput({ alert: 'false', ok: 'false' });
    process.exit(failed.length ? 1 : 0);
  }

  const nights = A.buildNights(data, { sites: A.SITES, nights: LOOKAHEAD });
  const summary = A.summarise(nights, A.TZ);
  const now = A.nowcast(data, A.SITES.filter((s) => s.id === nights[0].best.siteId)[0], Date.now());

  // Solar wind history, thinned to 5-minute steps for the sparkline.
  const series = (data.wind.series || []).filter((_, i) => i % 2 === 0)
    .map((p) => ({ t: p.t, bz: r1(p.bz) }));

  const snapshot = {
    generator: 'check-aurora.js ' + A.VERSION,
    fetchedAt: data.fetchedAt,
    threshold: THRESHOLD,
    summary: summary.text,
    alert: summary.alert,
    nights: nights.map(slimNight),
    nowcast: now,
    kpNow: data.kpNow,
    scales: data.scales,
    ovation: data.ovation,
    wind: {
      bz: r1(data.wind.bz), bt: r1(data.wind.bt), bzMean30: r1(data.wind.bzMean30),
      speed: r1(data.wind.speed), density: r1(data.wind.density),
      time: data.wind.time, measuredAt: data.wind.measuredAt, propagated: data.wind.propagated,
      series
    },
    alerts: (data.alerts || []).slice(0, 5).map((a) => ({
      id: a.id, issued: a.issued, headline: a.headline, message: a.message.slice(0, 1400)
    }))
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(snapshot));

  const alertNight = nights.filter((n) => n.index <= 1 && n.best.score >= THRESHOLD)[0] || null;

  console.log(summary.text);
  nights.forEach((n) => {
    console.log(`  ${n.dateKey}  ${n.verdict.label.padEnd(5)} ${String(n.best.score).padStart(3)}/100  ` +
      `Kp ${n.best.kpMax === null ? ' — ' : n.best.kpMax.toFixed(1)}  ${n.best.site.short} ` +
      `(blocked ${n.best.cloudBest === null ? '—' : n.best.cloudBest + '%'})`);
  });
  console.log('Snapshot: ' + path.relative(ROOT, OUT) + ' (' + Math.round(fs.statSync(OUT).size / 1024) + ' kB)');

  ghOutput({
    ok: 'true',
    alert: alertNight ? 'true' : 'false',
    date_key: alertNight ? alertNight.dateKey : nights[0].dateKey,
    score: alertNight ? String(alertNight.best.score) : String(nights[0].best.score),
    title: alertNight
      ? `Aurora watch — night of ${A.fmtDate(alertNight.dateKey, A.TZ)} · ${alertNight.best.score}/100 at ${alertNight.best.site.short}`
      : '',
    body: issueBody(nights, summary),
    summary: summary.text
  });
})().catch((e) => {
  console.error(e);
  ghOutput({ alert: 'false', ok: 'false' });
  process.exit(1);
});
