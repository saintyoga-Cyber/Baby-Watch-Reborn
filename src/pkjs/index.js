var timeline = require('./timeline');

var defaultConfig = {
  event1Name: "Bottle Feed",
  event1Icon: "system://images/DINNER_RESERVATION",
  event2Name: "Breastfeed",
  event2Icon: "system://images/GLUCOSE_MONITOR",
  event3Name: "Diaper Change",
  event3Icon: "system://images/SCHEDULED_EVENT",
  event4Name: "Sleep Started",
  event4Icon: "system://images/TIDE_IS_HIGH",
  event5Name: "Sleep Ended",
  event5Icon: "system://images/ALARM_CLOCK",
  haUrl: "",
  haToken: "",
  haDeviceId: ""
};

var config = {};
try {
  var savedConfig = localStorage.getItem('babyWatchConfig');
  config = savedConfig ? JSON.parse(savedConfig) : defaultConfig;
} catch (e) {
  config = defaultConfig;
}

// Event type constants - must match C code
var EVENT_BOTTLE      = 1;
var EVENT_DIAPER      = 2;
var EVENT_SLEEP_START = 3;
var EVENT_SLEEP_END   = 4;
var EVENT_NURSING     = 5;

var KEY_EVENT_TYPE = 0;
var KEY_EVENT_TIME = 1;

var availableIcons = [
  { id: "DINNER_RESERVATION", name: "Food/Bottle" },
  { id: "GLUCOSE_MONITOR",    name: "Health/Nursing" },
  { id: "SCHEDULED_EVENT",    name: "Event" },
  { id: "TIDE_IS_HIGH",       name: "Moon/Sleep" },
  { id: "ALARM_CLOCK",        name: "Alarm/Wake" },
  { id: "TIMELINE_CALENDAR",  name: "Calendar" },
  { id: "NOTIFICATION_FLAG",  name: "Flag" },
  { id: "GENERIC_CONFIRMATION", name: "Checkmark" },
  { id: "BIRTHDAY_EVENT",     name: "Birthday" },
  { id: "REACHED_FITNESS_GOAL", name: "Goal" },
  { id: "GENERIC_EMAIL",      name: "Email" },
  { id: "GENERIC_SMS",        name: "Message" },
  { id: "MUSIC_EVENT",        name: "Music" },
  { id: "PAY_BILL",           name: "Bill/Task" },
  { id: "HOCKEY_GAME",        name: "Hockey" },
  { id: "BASKETBALL",         name: "Basketball" },
  { id: "SOCCER_GAME",        name: "Soccer" },
  { id: "AMERICAN_FOOTBALL",  name: "Football" }
];

function getEventConfig(eventType) {
  switch (eventType) {
    case EVENT_BOTTLE:      return { name: config.event1Name || defaultConfig.event1Name, icon: config.event1Icon || defaultConfig.event1Icon };
    case EVENT_NURSING:     return { name: config.event2Name || defaultConfig.event2Name, icon: config.event2Icon || defaultConfig.event2Icon };
    case EVENT_DIAPER:      return { name: config.event3Name || defaultConfig.event3Name, icon: config.event3Icon || defaultConfig.event3Icon };
    case EVENT_SLEEP_START: return { name: config.event4Name || defaultConfig.event4Name, icon: config.event4Icon || defaultConfig.event4Icon };
    case EVENT_SLEEP_END:   return { name: config.event5Name || defaultConfig.event5Name, icon: config.event5Icon || defaultConfig.event5Icon };
    default:                return { name: 'Unknown Event', icon: 'system://images/NOTIFICATION_FLAG' };
  }
}

function formatTime(timestamp) {
  var date = new Date(timestamp * 1000);
  var hours = date.getHours();
  var minutes = date.getMinutes();
  var ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  return hours + ':' + minutes + ' ' + ampm;
}

function createEventPin(eventType, timestamp) {
  var eventCfg = getEventConfig(eventType);
  var date = new Date(timestamp * 1000);
  var pin = {
    "id": 'baby-watch-' + eventType + '-' + timestamp,
    "time": date.toISOString(),
    "layout": {
      "type": "genericPin",
      "title": eventCfg.name,
      "body": "Logged at " + formatTime(timestamp),
      "tinyIcon": eventCfg.icon
    },
    "reminders": [{
      "time": date.toISOString(),
      "layout": {
        "type": "genericReminder",
        "title": eventCfg.name,
        "tinyIcon": eventCfg.icon
      }
    }]
  };
  return pin;
}

function pushTimelinePin(eventType, timestamp) {
  var pin = createEventPin(eventType, timestamp);
  console.log('Pushing timeline pin: ' + JSON.stringify(pin));
  timeline.insertUserPin(pin, function(responseText) {
    console.log('Timeline pin result: ' + responseText);
  });
}

// Calls a Home Assistant service via the HA REST API
function callHAService(service, extraData) {
  var haUrl   = config.haUrl   || '';
  var haToken = config.haToken || '';
  if (!haUrl || !haToken) {
    console.log('HA not configured, skipping service: ' + service);
    return;
  }

  var url = haUrl.replace(/\/$/, '') + '/api/services/' + service;
  var body = { device_id: config.haDeviceId || '' };
  for (var k in extraData) { body[k] = extraData[k]; }

  var xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Authorization', 'Bearer ' + haToken);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      console.log('HA ' + service + ' -> ' + xhr.status);
    }
  };
  xhr.send(JSON.stringify(body));
}

function logToHA(eventType) {
  switch (eventType) {
    case EVENT_BOTTLE:      callHAService('huckleberry/log_bottle',      {}); break;
    case EVENT_NURSING:     callHAService('huckleberry/start_nursing',   {}); break;
    case EVENT_DIAPER:      callHAService('huckleberry/log_diaper_both', {}); break;
    case EVENT_SLEEP_START: callHAService('huckleberry/start_sleep',     {}); break;
    case EVENT_SLEEP_END:   callHAService('huckleberry/complete_sleep',  {}); break;
  }
}

function getPayloadValue(payload, stringKey, numericKey) {
  if (payload[stringKey]  !== undefined) return payload[stringKey];
  if (payload[numericKey] !== undefined) return payload[numericKey];
  return undefined;
}

// ---- Settings Page ----

function generateSettingsPage() {
  var iconOptions = availableIcons.map(function(icon) {
    return '<option value="system://images/' + icon.id + '">' + icon.name + '</option>';
  }).join('\n');

  function eventSection(num, label, nameKey, iconKey) {
    var nameVal = config[nameKey] || defaultConfig[nameKey];
    var iconVal = config[iconKey] || defaultConfig[iconKey];
    return '<div class="section">\n' +
      '<h2>' + label + '</h2>\n' +
      '<label>Event Name</label>\n' +
      '<input type="text" id="' + nameKey + '" value="' + nameVal + '">\n' +
      '<label>Timeline Icon</label>\n' +
      '<select id="' + iconKey + '">' + iconOptions + '</select>\n' +
      '</div>\n';
  }

  var haUrl      = config.haUrl      || '';
  var haToken    = config.haToken    || '';
  var haDeviceId = config.haDeviceId || '';

  var html = '<!DOCTYPE html>\n' +
    '<html><head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>Baby Watch Settings</title>\n' +
    '<style>\n' +
    'body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; background: #1a1a2e; color: #eee; margin: 0; }\n' +
    'h1 { color: #4cc9f0; font-size: 24px; margin-bottom: 20px; text-align: center; }\n' +
    '.section { background: #16213e; border-radius: 12px; padding: 16px; margin-bottom: 16px; }\n' +
    '.section h2 { color: #4cc9f0; font-size: 16px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #0f3460; }\n' +
    'label { display: block; color: #aaa; font-size: 12px; margin-bottom: 4px; }\n' +
    'input, select { width: 100%; padding: 12px; border: 1px solid #0f3460; border-radius: 8px; background: #0f3460; color: #fff; font-size: 16px; margin-bottom: 12px; box-sizing: border-box; }\n' +
    'input:focus, select:focus { outline: none; border-color: #4cc9f0; }\n' +
    '.btn { display: block; width: 100%; padding: 16px; border: none; border-radius: 8px; font-size: 18px; font-weight: 600; cursor: pointer; margin-top: 8px; }\n' +
    '.btn-save { background: #4cc9f0; color: #1a1a2e; }\n' +
    '.btn-reset { background: transparent; border: 1px solid #666; color: #aaa; }\n' +
    '.ha-note { color: #888; font-size: 11px; margin: -8px 0 12px 0; }\n' +
    '</style>\n' +
    '</head><body>\n' +
    '<h1>Baby Watch Settings</h1>\n' +

    eventSection(1, 'Bottle Feed',   'event1Name', 'event1Icon') +
    eventSection(2, 'Breastfeed',    'event2Name', 'event2Icon') +
    eventSection(3, 'Diaper Change', 'event3Name', 'event3Icon') +
    eventSection(4, 'Sleep Started', 'event4Name', 'event4Icon') +
    eventSection(5, 'Sleep Ended',   'event5Name', 'event5Icon') +

    '<div class="section">\n' +
    '<h2>Home Assistant</h2>\n' +
    '<label>HA URL</label>\n' +
    '<input type="text"     id="haUrl"      value="' + haUrl      + '" placeholder="http://homeassistant.local:8123">\n' +
    '<label>Long-Lived Access Token</label>\n' +
    '<input type="password" id="haToken"    value="' + haToken    + '" placeholder="eyJ0...">\n' +
    '<p class="ha-note">Generate in HA → Profile → Long-Lived Access Tokens</p>\n' +
    '<label>Child Device ID</label>\n' +
    '<input type="text"     id="haDeviceId" value="' + haDeviceId + '" placeholder="abc123def456...">\n' +
    '<p class="ha-note">Find in HA → Settings → Devices → your child\'s device</p>\n' +
    '</div>\n' +

    '<button class="btn btn-save"  onclick="saveSettings()">Save Settings</button>\n' +
    '<button class="btn btn-reset" onclick="resetDefaults()">Reset to Defaults</button>\n' +

    '<script>\n' +
    'function setSelectValue(id, value) {\n' +
    '  var s = document.getElementById(id);\n' +
    '  for (var i = 0; i < s.options.length; i++) {\n' +
    '    if (s.options[i].value === value) { s.selectedIndex = i; break; }\n' +
    '  }\n' +
    '}\n' +
    'setSelectValue("event1Icon", "' + (config.event1Icon || defaultConfig.event1Icon) + '");\n' +
    'setSelectValue("event2Icon", "' + (config.event2Icon || defaultConfig.event2Icon) + '");\n' +
    'setSelectValue("event3Icon", "' + (config.event3Icon || defaultConfig.event3Icon) + '");\n' +
    'setSelectValue("event4Icon", "' + (config.event4Icon || defaultConfig.event4Icon) + '");\n' +
    'setSelectValue("event5Icon", "' + (config.event5Icon || defaultConfig.event5Icon) + '");\n' +
    'function saveSettings() {\n' +
    '  var cfg = {\n' +
    '    event1Name: document.getElementById("event1Name").value,\n' +
    '    event1Icon: document.getElementById("event1Icon").value,\n' +
    '    event2Name: document.getElementById("event2Name").value,\n' +
    '    event2Icon: document.getElementById("event2Icon").value,\n' +
    '    event3Name: document.getElementById("event3Name").value,\n' +
    '    event3Icon: document.getElementById("event3Icon").value,\n' +
    '    event4Name: document.getElementById("event4Name").value,\n' +
    '    event4Icon: document.getElementById("event4Icon").value,\n' +
    '    event5Name: document.getElementById("event5Name").value,\n' +
    '    event5Icon: document.getElementById("event5Icon").value,\n' +
    '    haUrl:      document.getElementById("haUrl").value,\n' +
    '    haToken:    document.getElementById("haToken").value,\n' +
    '    haDeviceId: document.getElementById("haDeviceId").value\n' +
    '  };\n' +
    '  window.location.href = "pebblejs://close#" + encodeURIComponent(JSON.stringify(cfg));\n' +
    '}\n' +
    'function resetDefaults() {\n' +
    '  document.getElementById("event1Name").value = "Bottle Feed";\n' +
    '  document.getElementById("event2Name").value = "Breastfeed";\n' +
    '  document.getElementById("event3Name").value = "Diaper Change";\n' +
    '  document.getElementById("event4Name").value = "Sleep Started";\n' +
    '  document.getElementById("event5Name").value = "Sleep Ended";\n' +
    '  setSelectValue("event1Icon", "system://images/DINNER_RESERVATION");\n' +
    '  setSelectValue("event2Icon", "system://images/GLUCOSE_MONITOR");\n' +
    '  setSelectValue("event3Icon", "system://images/SCHEDULED_EVENT");\n' +
    '  setSelectValue("event4Icon", "system://images/TIDE_IS_HIGH");\n' +
    '  setSelectValue("event5Icon", "system://images/ALARM_CLOCK");\n' +
    '  document.getElementById("haUrl").value      = "";\n' +
    '  document.getElementById("haToken").value    = "";\n' +
    '  document.getElementById("haDeviceId").value = "";\n' +
    '}\n' +
    '</script>\n' +
    '</body></html>';

  return html;
}

// ---- Pebble Event Listeners ----

Pebble.addEventListener('ready', function() {
  console.log('=== BABY WATCH JS READY ===');
  console.log('Config: ' + JSON.stringify(config));
  Pebble.getTimelineToken(function(token) {
    console.log('Timeline token OK: ' + token.substring(0, 15) + '...');
  }, function(error) {
    console.log('Timeline token FAILED: ' + error);
  });
});

Pebble.addEventListener('showConfiguration', function() {
  var html = generateSettingsPage();
  Pebble.openURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (e && e.response) {
    try {
      var newConfig = JSON.parse(decodeURIComponent(e.response));
      config = newConfig;
      localStorage.setItem('babyWatchConfig', JSON.stringify(config));
      console.log('Settings saved');
    } catch (err) {
      console.log('Error parsing config: ' + err);
    }
  }
});

Pebble.addEventListener('appmessage', function(e) {
  console.log('=== APPMESSAGE ===');
  var eventType = getPayloadValue(e.payload, 'EVENT_TYPE', KEY_EVENT_TYPE);
  var timestamp = getPayloadValue(e.payload, 'EVENT_TIME', KEY_EVENT_TIME);
  console.log('eventType=' + eventType + ', timestamp=' + timestamp);

  if (eventType !== undefined && timestamp !== undefined) {
    pushTimelinePin(eventType, timestamp);
    logToHA(eventType);
  } else {
    console.log('ERROR: Missing data. Keys: ' + Object.keys(e.payload).join(', '));
  }
});
