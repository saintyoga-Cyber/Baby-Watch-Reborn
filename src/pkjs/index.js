var timeline = require('./timeline');

// Event type constants - must match C code
var EVENT_BOTTLE = 1;
var EVENT_DIAPER = 2;
var EVENT_SLEEP_START = 3;
var EVENT_SLEEP_END = 4;

// Message key indices
var KEY_EVENT_TYPE = 0;
var KEY_EVENT_TIME = 1;
var KEY_EVENT_VOLUME = 2;
var KEY_EVENT_DIAPER_TYPE = 3;

// localStorage key for the on-phone event log (newest first)
var LOG_KEY = 'babyWatchLog';
var LOG_MAX_ENTRIES = 1000;

// Base URL of the shared-log viewer (docs/log.html on GitHub Pages).
// PERSONAL BUILD ONLY - this share feature is not in the Pebble store build.
var SHARE_BASE_URL = 'https://saintyoga-cyber.github.io/baby-watch-reborn/log.html';

// Live sharing: the log is mirrored to a secret GitHub Gist so one stable link
// keeps showing fresh data. The token is entered on the settings screen and
// kept in localStorage on this phone only - it is never committed to the repo.
var GIST_TOKEN_KEY = 'babyWatchGistToken';
var GIST_ID_KEY = 'babyWatchGistId';
var GIST_FILENAME = 'baby-log.json';

// Event names + timeline icons (fixed defaults; previously user-configurable)
var EVENT_INFO = {
  1: { name: "Bottle Feed",   icon: "system://images/DINNER_RESERVATION", emoji: "🍼" },
  2: { name: "Diaper Change", icon: "system://images/SCHEDULED_EVENT",    emoji: "🧷" },
  3: { name: "Sleep Started", icon: "system://images/TIDE_IS_HIGH",       emoji: "😴" },
  4: { name: "Sleep Ended",   icon: "system://images/ALARM_CLOCK",        emoji: "☀️" }
};

function eventInfo(eventType) {
  return EVENT_INFO[eventType] || { name: 'Unknown Event', icon: 'system://images/NOTIFICATION_FLAG', emoji: '•' };
}

// Diaper type values - must match C code (0 = not recorded)
function diaperTypeName(type) {
  switch (type) {
    case 1: return "Pee";
    case 2: return "Poo";
    case 3: return "Both";
    default: return null;
  }
}

function formatTime(timestamp) {
  var date = new Date(timestamp * 1000);
  var hours = date.getHours();
  var minutes = date.getMinutes();
  var ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  return hours + ':' + minutes + ' ' + ampm;
}

function createEventPin(eventType, timestamp, volume, diaperType) {
  var info = eventInfo(eventType);

  var date = new Date(timestamp * 1000);
  var isoTime = date.toISOString();
  var pinId = 'baby-watch-' + eventType + '-' + timestamp;

  var body = "Logged at " + formatTime(timestamp);

  var layout = {
    "type": "genericPin",
    "title": info.name,
    "tinyIcon": info.icon
  };

  // Bottle feeds may carry a milk volume (mL). 0 / missing means it was skipped.
  if (eventType === EVENT_BOTTLE && volume) {
    var volumeText = volume + " mL";
    layout.subtitle = volumeText;           // shown as the timeline list subtext
    body = volumeText + "\n" + body;        // and inside the opened pin
  }

  // Diaper changes may carry a type (pee / poo / both). 0 / missing = skipped.
  if (eventType === EVENT_DIAPER) {
    var typeName = diaperTypeName(diaperType);
    if (typeName) {
      layout.subtitle = typeName;           // shown as the timeline list subtext
      body = typeName + "\n" + body;        // and inside the opened pin
    }
  }

  layout.body = body;

  var pin = {
    "id": pinId,
    "time": isoTime,
    "layout": layout,
    "reminders": [{
      "time": isoTime,
      "layout": {
        "type": "genericReminder",
        "title": info.name,
        "tinyIcon": info.icon
      }
    }]
  };

  return pin;
}

function pushTimelinePin(eventType, timestamp, volume, diaperType) {
  var pin = createEventPin(eventType, timestamp, volume, diaperType);
  if (!pin) return;

  console.log('Pushing timeline pin: ' + JSON.stringify(pin));

  timeline.insertUserPin(pin, function(responseText) {
    console.log('Timeline pin result: ' + responseText);
  });
}

function getPayloadValue(payload, stringKey, numericKey) {
  if (payload[stringKey] !== undefined) {
    return payload[stringKey];
  }
  if (payload[numericKey] !== undefined) {
    return payload[numericKey];
  }
  return undefined;
}

// Read the stored log, tolerating a missing or corrupt key.
function readLog() {
  try {
    var parsed = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed : [];
  } catch (e) {
    return [];
  }
}

function readSetting(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch (e) {
    return '';
  }
}

// Mirror the log to a secret Gist so the shared link always shows fresh data.
// Fire-and-forget: failures are logged but never block logging or timeline pins.
function syncToGist(callback) {
  var token = readSetting(GIST_TOKEN_KEY);
  if (!token) {
    if (callback) callback(false, 'No token configured');
    return;
  }

  var payload = { description: 'Baby Watch Reborn log', files: {} };
  payload.files[GIST_FILENAME] = {
    content: JSON.stringify({ v: 1, updated: Math.floor(Date.now() / 1000), events: readLog() })
  };

  var gistId = readSetting(GIST_ID_KEY);
  if (!gistId) {
    payload.public = false;   // secret gist; only honoured on create
  }

  var xhr = new XMLHttpRequest();
  xhr.open(gistId ? 'PATCH' : 'POST',
           gistId ? 'https://api.github.com/gists/' + gistId : 'https://api.github.com/gists');
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'application/vnd.github+json');
  xhr.setRequestHeader('Authorization', 'Bearer ' + token);
  xhr.onload = function () {
    if (this.status >= 200 && this.status < 300) {
      try {
        var res = JSON.parse(this.responseText);
        if (res.id && res.id !== gistId) {
          localStorage.setItem(GIST_ID_KEY, res.id);
          console.log('gist: created ' + res.id);
        }
        console.log('gist: sync ok');
        if (callback) callback(true, res.id || gistId);
      } catch (e) {
        if (callback) callback(false, 'Unreadable response');
      }
    } else {
      console.log('gist: sync failed HTTP ' + this.status);
      if (callback) callback(false, 'HTTP ' + this.status);
    }
  };
  xhr.onerror = function () {
    console.log('gist: network error');
    if (callback) callback(false, 'Network error');
  };
  xhr.send(JSON.stringify(payload));
}

// Append an event to the on-phone log (newest first, capped at LOG_MAX_ENTRIES).
function saveEventToLog(type, ts, vol, diaper) {
  var log = readLog();
  log.unshift({ type: type, ts: ts, vol: vol || 0, diaper: diaper || 0 });
  if (log.length > LOG_MAX_ENTRIES) {
    log = log.slice(0, LOG_MAX_ENTRIES);
  }
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch (e) {
    console.log('Error saving log: ' + e);
  }
}

// "2h 15m" / "45m" from a duration in seconds.
function formatDuration(seconds) {
  if (seconds < 0) seconds = 0;
  var mins = Math.round(seconds / 60);
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

// Friendly day header: "Today", "Yesterday", "Tuesday, Jun 23" (+ year if old).
function dayLabel(date) {
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var that = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  var diffDays = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  var weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var label = weekdays[date.getDay()] + ', ' + months[date.getMonth()] + ' ' + date.getDate();
  if (date.getFullYear() !== now.getFullYear()) {
    label += ', ' + date.getFullYear();
  }
  return label;
}

// Detail text for a log row (volume / diaper type / sleep duration), or ''.
function eventDetail(ev, sortedLog, index) {
  if (ev.type === EVENT_BOTTLE && ev.vol) {
    return ev.vol + ' mL';
  }
  if (ev.type === EVENT_DIAPER) {
    return diaperTypeName(ev.diaper) || '';
  }
  if (ev.type === EVENT_SLEEP_END) {
    // Scan toward older entries for the nearest preceding sleep-start.
    // (sortedLog is newest-first, so older entries have higher indices.)
    for (var j = index + 1; j < sortedLog.length; j++) {
      if (sortedLog[j].type === EVENT_SLEEP_START && sortedLog[j].ts <= ev.ts) {
        return formatDuration(ev.ts - sortedLog[j].ts);
      }
    }
  }
  return '';
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

// CSV-escape a field: wrap in quotes and double inner quotes only when needed.
// Defensive — current values are numeric / fixed labels, so none need quoting.
function csvField(value) {
  var s = (value === null || value === undefined) ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Build a CSV string from the log, chronological (oldest first) for spreadsheets.
function buildCsv(log) {
  var rows = log.slice().sort(function(a, b) { return a.ts - b.ts; });
  var lines = ['Date,Time,Event,Volume (mL),Diaper,Sleep Duration'];
  for (var i = 0; i < rows.length; i++) {
    var ev = rows[i];
    var d = new Date(ev.ts * 1000);
    var dateStr = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    var timeStr = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    var volume = (ev.type === EVENT_BOTTLE && ev.vol) ? ev.vol : '';
    var diaper = (ev.type === EVENT_DIAPER) ? (diaperTypeName(ev.diaper) || '') : '';
    var duration = '';
    if (ev.type === EVENT_SLEEP_END) {
      // Nearest preceding sleep-start (rows are oldest-first here).
      for (var j = i - 1; j >= 0; j--) {
        if (rows[j].type === EVENT_SLEEP_START && rows[j].ts <= ev.ts) {
          duration = formatDuration(ev.ts - rows[j].ts);
          break;
        }
      }
    }
    lines.push([
      csvField(dateStr),
      csvField(timeStr),
      csvField(eventInfo(ev.type).name),
      csvField(volume),
      csvField(diaper),
      csvField(duration)
    ].join(','));
  }
  return lines.join('\r\n');
}

// Encode the log compactly for a share-link fragment:
//   "1.<baseTs36>.<type-deltaTs-vol-diaper>_<...>"
// Timestamps are stored as base-36 deltas and trailing zero fields are trimmed,
// which keeps the URL a few times shorter than JSON. Only URL-safe characters
// (0-9a-z, '-', '_', '.') are produced, so the fragment needs no escaping.
function encodeLogForShare(log) {
  var rows = log.slice().sort(function(a, b) { return a.ts - b.ts; });
  if (rows.length === 0) return '';
  var base = rows[0].ts;
  var prev = base;
  var parts = [];
  for (var i = 0; i < rows.length; i++) {
    var ev = rows[i];
    var delta = ev.ts - prev;
    prev = ev.ts;
    var f = [
      (ev.type || 0).toString(36),
      (delta < 0 ? 0 : delta).toString(36),
      (ev.vol || 0).toString(36),
      (ev.diaper || 0).toString(36)
    ];
    while (f.length > 2 && f[f.length - 1] === '0') {
      f.pop();
    }
    parts.push(f.join('-'));
  }
  return '1.' + base.toString(36) + '.' + parts.join('_');
}

// Build the event-log page shown via the companion app's "settings" link.
function generateLogPage() {
  var log = readLog();
  log.sort(function(a, b) { return b.ts - a.ts; });

  var csv = buildCsv(log);
  var shareUrl = log.length ? (SHARE_BASE_URL + '#' + encodeLogForShare(log)) : '';

  // Live link: stable URL backed by the secret Gist (auto-updates).
  var gistId = readSetting(GIST_ID_KEY);
  var hasToken = !!readSetting(GIST_TOKEN_KEY);
  var liveUrl = gistId ? (SHARE_BASE_URL + '#g=' + gistId) : '';

  var body = '';
  if (log.length === 0) {
    body = '<div class="empty">No events logged yet.<br>Start tracking on your watch.</div>';
  } else {
    var lastDayKey = null;
    for (var i = 0; i < log.length; i++) {
      var ev = log[i];
      var date = new Date(ev.ts * 1000);
      var dayKey = date.toDateString();
      if (dayKey !== lastDayKey) {
        body += '<div class="day">' + dayLabel(date) + '</div>';
        lastDayKey = dayKey;
      }
      var info = eventInfo(ev.type);
      var detail = eventDetail(ev, log, i);
      var detailHtml = detail ? '<span class="detail">' + detail + '</span>' : '';
      body += '<div class="row">' +
        '<span class="icon">' + info.emoji + '</span>' +
        '<span class="rinfo"><span class="name">' + info.name + '</span>' + detailHtml + '</span>' +
        '<span class="time">' + formatTime(ev.ts) + '</span>' +
        '</div>';
    }
  }

  var html = '<!DOCTYPE html>\n' +
    '<html><head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>Baby Watch Log</title>\n' +
    '<style>\n' +
    'body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; background: #1a1a2e; color: #eee; margin: 0; }\n' +
    'h1 { color: #4cc9f0; font-size: 22px; margin: 4px 0 16px 0; text-align: center; }\n' +
    '.day { color: #4cc9f0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 4px 8px 4px; }\n' +
    '.row { display: flex; align-items: center; background: #16213e; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; }\n' +
    '.icon { font-size: 22px; margin-right: 14px; width: 26px; text-align: center; }\n' +
    '.rinfo { display: flex; flex-direction: column; flex: 1; min-width: 0; }\n' +
    '.name { color: #fff; font-size: 16px; }\n' +
    '.detail { color: #4cc9f0; font-size: 13px; margin-top: 2px; }\n' +
    '.time { color: #aaa; font-size: 14px; margin-left: 12px; white-space: nowrap; }\n' +
    '.empty { text-align: center; color: #888; font-size: 16px; margin-top: 60px; line-height: 1.6; }\n' +
    '.btn { display: block; width: 100%; padding: 14px; border-radius: 8px; font-size: 16px; cursor: pointer; margin: 8px 0; box-sizing: border-box; }\n' +
    '.btn-export { background: #4cc9f0; color: #1a1a2e; border: none; font-weight: 600; margin-top: 24px; }\n' +
    '.btn-clear { background: transparent; color: #aaa; border: 1px solid #666; }\n' +
    '#exportBox { margin: 8px 0; }\n' +
    '.btn-share { background: transparent; color: #4cc9f0; border: 1px solid #4cc9f0; font-weight: 600; }\n' +
    '.sh { color: #4cc9f0; font-size: 15px; margin: 18px 2px 4px 2px; }\n' +
    '.hint { color: #aaa; font-size: 13px; line-height: 1.5; margin: 4px 2px 8px 2px; }\n' +
    '#tokenInput { width: 100%; padding: 12px; border: 1px solid #0f3460; border-radius: 8px; background: #0f3460; color: #fff; font-size: 15px; box-sizing: border-box; margin-bottom: 4px; }\n' +
    '#liveText { width: 100%; height: 70px; background: #0f3460; color: #eee; border: 1px solid #0f3460; border-radius: 8px; padding: 10px; font-family: monospace; font-size: 12px; box-sizing: border-box; word-break: break-all; resize: vertical; }\n' +
    '#liveMsg { display: block; text-align: center; color: #4cc9f0; font-size: 13px; min-height: 18px; }\n' +
    '#shareBox { margin: 8px 0; }\n' +
    '.warn { color: #f0a000; font-size: 13px; line-height: 1.5; margin: 8px 2px; }\n' +
    '#shareText { width: 100%; height: 90px; background: #0f3460; color: #eee; border: 1px solid #0f3460; border-radius: 8px; padding: 10px; font-family: monospace; font-size: 11px; box-sizing: border-box; word-break: break-all; resize: vertical; }\n' +
    '#shareMsg { display: block; text-align: center; color: #4cc9f0; font-size: 13px; min-height: 18px; }\n' +
    '#csvText { width: 100%; height: 160px; background: #0f3460; color: #eee; border: 1px solid #0f3460; border-radius: 8px; padding: 10px; font-family: monospace; font-size: 12px; box-sizing: border-box; resize: vertical; }\n' +
    '.btn-copy { background: #4cc9f0; color: #1a1a2e; border: none; font-weight: 600; }\n' +
    '.btn-download { display: block; text-align: center; padding: 14px; border-radius: 8px; border: 1px solid #4cc9f0; color: #4cc9f0; text-decoration: none; margin: 8px 0; }\n' +
    '#copyMsg { display: block; text-align: center; color: #4cc9f0; font-size: 13px; min-height: 18px; }\n' +
    '</style>\n' +
    '</head><body>\n' +
    '<h1>Baby Watch Log</h1>\n' +
    body + '\n' +
    (log.length > 0 ?
      '<button class="btn btn-export" onclick="showExport()">Export CSV</button>\n' +
      '<div id="exportBox" style="display:none">\n' +
      '<textarea id="csvText" readonly></textarea>\n' +
      '<button class="btn btn-copy" onclick="copyCsv()">Copy to clipboard</button>\n' +
      '<a id="csvDownload" class="btn-download" download="baby-log.csv">Download .csv file</a>\n' +
      '<span id="copyMsg"></span>\n' +
      '</div>\n' +
      '<button class="btn btn-share" onclick="showShare()">Share Link</button>\n' +
      '<div id="shareBox" style="display:none">\n' +
      (liveUrl ?
        '<h3 class="sh">Live link (updates automatically)</h3>\n' +
        '<p class="hint">Send this once. It refreshes every time it is opened.</p>\n' +
        '<textarea id="liveText" readonly></textarea>\n' +
        '<button class="btn btn-copy" onclick="copyLive()">Copy live link</button>\n' +
        '<a id="liveOpen" class="btn-download" target="_blank" rel="noopener">Open live link</a>\n' +
        '<span id="liveMsg"></span>\n'
        :
        '<h3 class="sh">Live link — not set up yet</h3>\n' +
        '<p class="hint">Paste a GitHub token with only the <b>gist</b> scope. It is stored on this phone only and is never put in the link. Saving creates a secret Gist and gives you one stable URL.</p>\n' +
        '<input type="password" id="tokenInput" placeholder="ghp_..." autocomplete="off" autocapitalize="none" spellcheck="false">\n' +
        '<button class="btn btn-copy" onclick="saveToken()">Save token &amp; create link</button>\n'
      ) +
      (hasToken && !liveUrl ? '<p class="warn">Token saved, but no Gist yet — log an event (or reopen this page) to create it.</p>\n' : '') +
      '<h3 class="sh">Snapshot link</h3>\n' +
      '<p class="warn">Frozen copy: the data is inside the link, so it never updates and cannot be revoked.</p>\n' +
      '<textarea id="shareText" readonly></textarea>\n' +
      '<button class="btn btn-copy" onclick="copyShare()">Copy snapshot link</button>\n' +
      '<a id="shareOpen" class="btn-download" target="_blank" rel="noopener">Open snapshot</a>\n' +
      '<span id="shareMsg"></span>\n' +
      '</div>\n' +
      '<button class="btn btn-clear" onclick="clearLog()">Clear Log</button>\n'
      : '') +
    '<script>\n' +
    'var CSV_DATA = ' + JSON.stringify(csv) + ';\n' +
    'var SHARE_URL = ' + JSON.stringify(shareUrl) + ';\n' +
    'function showExport() {\n' +
    '  document.getElementById("csvText").value = CSV_DATA;\n' +
    '  document.getElementById("csvDownload").href = "data:text/csv;charset=utf-8," + encodeURIComponent(CSV_DATA);\n' +
    '  document.getElementById("exportBox").style.display = "block";\n' +
    '}\n' +
    'function copyCsv() {\n' +
    '  var t = document.getElementById("csvText");\n' +
    '  t.focus();\n' +
    '  t.select();\n' +
    '  t.setSelectionRange(0, CSV_DATA.length);\n' +
    '  var ok = false;\n' +
    '  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }\n' +
    '  document.getElementById("copyMsg").textContent = ok ? "Copied to clipboard!" : "Select the text above and copy manually.";\n' +
    '}\n' +
    'var LIVE_URL = ' + JSON.stringify(liveUrl) + ';\n' +
    'function showShare() {\n' +
    '  document.getElementById("shareText").value = SHARE_URL;\n' +
    '  document.getElementById("shareOpen").href = SHARE_URL;\n' +
    '  if (LIVE_URL) {\n' +
    '    document.getElementById("liveText").value = LIVE_URL;\n' +
    '    document.getElementById("liveOpen").href = LIVE_URL;\n' +
    '  }\n' +
    '  document.getElementById("shareBox").style.display = "block";\n' +
    '}\n' +
    'function copyField(id, value, msgId, label) {\n' +
    '  var t = document.getElementById(id);\n' +
    '  t.focus();\n' +
    '  t.select();\n' +
    '  t.setSelectionRange(0, value.length);\n' +
    '  var ok = false;\n' +
    '  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }\n' +
    '  document.getElementById(msgId).textContent = ok ? (label + " copied!") : "Select the text above and copy manually.";\n' +
    '}\n' +
    'function copyLive() { copyField("liveText", LIVE_URL, "liveMsg", "Live link"); }\n' +
    'function saveToken() {\n' +
    '  var v = document.getElementById("tokenInput").value.replace(/^\\s+|\\s+$/g, "");\n' +
    '  if (!v) { alert("Paste a token first."); return; }\n' +
    '  window.location.href = "pebblejs://close#" + encodeURIComponent(JSON.stringify({ action: "saveToken", token: v }));\n' +
    '}\n' +
    'function copyShare() { copyField("shareText", SHARE_URL, "shareMsg", "Snapshot link"); }\n' +
    'function clearLog() {\n' +
    '  if (confirm("Clear all logged events? This cannot be undone.")) {\n' +
    '    window.location.href = "pebblejs://close#" + encodeURIComponent(JSON.stringify({ action: "clearLog" }));\n' +
    '  }\n' +
    '}\n' +
    '</script>\n' +
    '</body></html>';

  return html;
}

Pebble.addEventListener('ready', function() {
  console.log('=== BABY WATCH JS READY (v2.0) ===');
  console.log('Timeline: Rebble API');

  Pebble.getTimelineToken(function(token) {
    console.log('Timeline token OK: ' + token.substring(0, 15) + '...');
  }, function(error) {
    console.log('Timeline token FAILED: ' + error);
  });
});

Pebble.addEventListener('showConfiguration', function() {
  var html = generateLogPage();
  var dataUri = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  Pebble.openURL(dataUri);
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) return;
  try {
    var data = JSON.parse(decodeURIComponent(e.response));
    if (data && data.action === 'clearLog') {
      localStorage.removeItem(LOG_KEY);
      console.log('Event log cleared');
      syncToGist();   // push the emptied log so the shared link clears too
    } else if (data && data.action === 'saveToken' && data.token) {
      localStorage.setItem(GIST_TOKEN_KEY, data.token);
      console.log('gist: token saved, creating gist...');
      syncToGist(function (ok, info) {
        console.log('gist: setup ' + (ok ? 'ok, id=' + info : 'failed: ' + info));
      });
    }
  } catch (err) {
    console.log('Error parsing webview response: ' + err);
  }
});

Pebble.addEventListener('appmessage', function(e) {
  console.log('=== APPMESSAGE RECEIVED ===');
  console.log('Payload: ' + JSON.stringify(e.payload));

  var eventType = getPayloadValue(e.payload, 'EVENT_TYPE', KEY_EVENT_TYPE);
  var timestamp = getPayloadValue(e.payload, 'EVENT_TIME', KEY_EVENT_TIME);
  var volume = getPayloadValue(e.payload, 'EVENT_VOLUME', KEY_EVENT_VOLUME);
  var diaperType = getPayloadValue(e.payload, 'EVENT_DIAPER_TYPE', KEY_EVENT_DIAPER_TYPE);

  console.log('eventType=' + eventType + ', timestamp=' + timestamp + ', volume=' + volume + ', diaperType=' + diaperType);

  if (eventType !== undefined && timestamp !== undefined) {
    pushTimelinePin(eventType, timestamp, volume, diaperType);
    saveEventToLog(eventType, timestamp, volume, diaperType);
    syncToGist();   // keeps the shared link fresh; no-op when not configured
  } else {
    console.log('ERROR: Missing data. Keys: ' + Object.keys(e.payload).join(', '));
  }
});
