/**
 * Fetches the Airbnb iCal feed and writes availability.json.
 * Run via GitHub Actions; expects AIRBNB_ICAL_URL env var.
 *
 * Output format matches the calendar's _blockedRanges:
 *   { "ranges": [{ "start": "YYYYMMDD", "end": "YYYYMMDD" }, ...] }
 * Both start and end are YYYYMMDD strings; end is exclusive (checkout day).
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const url = process.env.AIRBNB_ICAL_URL;
if (!url) {
  console.error('AIRBNB_ICAL_URL environment variable is not set.');
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

(async () => {
  try {
    const ical = await fetch(url);
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

    // Sort by start date for tidiness
    ranges.sort((a, b) => (a.start > b.start ? 1 : -1));

    const out = JSON.stringify(
      { ranges, updatedAt: new Date().toISOString() },
      null,
      2
    );

    const outPath = path.join(__dirname, '..', 'availability.json');
    fs.writeFileSync(outPath, out);
    console.log(`Wrote ${ranges.length} blocked range(s) to availability.json`);
  } catch (err) {
    console.error('Failed to sync calendar:', err.message);
    process.exit(1);
  }
})();
