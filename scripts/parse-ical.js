/**
 * Fetches the Airbnb + Booking.com iCal feeds and writes availability.json,
 * merging blocked ranges from all configured sources.
 * Run via GitHub Actions; expects AIRBNB_ICAL_URL and/or BOOKING_ICAL_URL env vars.
 *
 * Output format matches the calendar's _blockedRanges:
 *   { "ranges": [{ "start": "YYYYMMDD", "end": "YYYYMMDD" }, ...] }
 * Both start and end are YYYYMMDD strings; end is exclusive (checkout day).
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const sources = [
  { name: 'Airbnb',     url: process.env.AIRBNB_ICAL_URL },
  { name: 'Booking.com', url: process.env.BOOKING_ICAL_URL },
].filter(s => s.url);

if (sources.length === 0) {
  console.error('No iCal URLs set. Provide AIRBNB_ICAL_URL and/or BOOKING_ICAL_URL.');
  process.exit(1);
}

function fetch(rawUrl) {
  return new Promise((resolve, reject) => {
    const lib = rawUrl.startsWith('https') ? https : http;
    lib.get(rawUrl, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function toDateStr(raw) {
  // Handles VALUE=DATE:20240601 and datetime 20240601T000000Z — take first 8 digits
  const m = raw.match(/(\d{8})/);
  return m ? m[1] : null;
}

function parseEvents(ical) {
  const ranges = [];
  const events = ical.split('BEGIN:VEVENT');
  events.shift(); // drop the header before first event

  for (const block of events) {
    const startLine = block.match(/DTSTART[^\r\n]*:([^\r\n]+)/);
    const endLine   = block.match(/DTEND[^\r\n]*:([^\r\n]+)/);
    if (!startLine || !endLine) continue;

    const start = toDateStr(startLine[1]);
    const end   = toDateStr(endLine[1]);
    if (start && end && start < end) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

(async () => {
  try {
    let ranges = [];

    for (const source of sources) {
      try {
        const ical = await fetch(source.url);
        const parsed = parseEvents(ical);
        console.log(`${source.name}: ${parsed.length} blocked range(s)`);
        ranges = ranges.concat(parsed);
      } catch (err) {
        console.error(`Failed to fetch ${source.name} calendar:`, err.message);
      }
    }

    // Sort by start date for tidiness
    ranges.sort((a, b) => (a.start > b.start ? 1 : -1));

    const out = JSON.stringify(
      { ranges, updatedAt: new Date().toISOString() },
      null,
      2
    );

    const outPath = path.join(__dirname, '..', 'availability.json');
    fs.writeFileSync(outPath, out);
    console.log(`Wrote ${ranges.length} total blocked range(s) to availability.json`);
  } catch (err) {
    console.error('Failed to sync calendar:', err.message);
    process.exit(1);
  }
})();
