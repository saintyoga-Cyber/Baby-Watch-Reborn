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

// Append an event to the on-phone log (newest first, capped at LOG_MAX_ENTRIES).
function saveEventToLog(type, ts, vol, diaper) {
  var log = [];
  try {
    log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  } catch (e) {
    log = [];
  }
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

// Build the event-log page shown via the companion app's "settings" link.
function generateLogPage() {
  var log = [];
  try {
    log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  } catch (e) {
    log = [];
  }
  log.sort(function(a, b) { return b.ts - a.ts; });

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
    '.btn-clear { display: block; width: 100%; padding: 14px; border: 1px solid #666; border-radius: 8px; background: transparent; color: #aaa; font-size: 16px; cursor: pointer; margin: 24px 0 8px 0; box-sizing: border-box; }\n' +
    '</style>\n' +
    '</head><body>\n' +
    '<h1>Baby Watch Log</h1>\n' +
    body + '\n' +
    (log.length > 0 ? '<button class="btn-clear" onclick="clearLog()">Clear Log</button>\n' : '') +
    '<script>\n' +
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
  } else {
    console.log('ERROR: Missing data. Keys: ' + Object.keys(e.payload).join(', '));
  }
});
