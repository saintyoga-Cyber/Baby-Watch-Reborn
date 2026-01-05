var timeline = require('./timeline');

// Default configuration - can be overridden by settings
var defaultConfig = {
  event1Name: "Bottle Feed",
  event1Icon: "system://images/DINNER_RESERVATION",
  event2Name: "Diaper Change", 
  event2Icon: "system://images/SCHEDULED_EVENT",
  event3Name: "Sleep Started",
  event3Icon: "system://images/TIDE_IS_HIGH",
  event4Name: "Sleep Ended",
  event4Icon: "system://images/ALARM_CLOCK"
};

// Load saved configuration or use defaults
var config = {};
try {
  var savedConfig = localStorage.getItem('babyWatchConfig');
  if (savedConfig) {
    config = JSON.parse(savedConfig);
    console.log('Loaded saved config');
  } else {
    config = defaultConfig;
  }
} catch (e) {
  config = defaultConfig;
  console.log('Using default config');
}

// Event type constants - must match C code
var EVENT_BOTTLE = 1;
var EVENT_DIAPER = 2;
var EVENT_SLEEP_START = 3;
var EVENT_SLEEP_END = 4;

// Message key indices
var KEY_EVENT_TYPE = 0;
var KEY_EVENT_TIME = 1;

// Available icons for configuration
var availableIcons = [
  { id: "DINNER_RESERVATION", name: "Food/Bottle" },
  { id: "SCHEDULED_EVENT", name: "Event" },
  { id: "TIDE_IS_HIGH", name: "Moon/Sleep" },
  { id: "ALARM_CLOCK", name: "Alarm/Wake" },
  { id: "TIMELINE_CALENDAR", name: "Calendar" },
  { id: "NOTIFICATION_FLAG", name: "Flag" },
  { id: "GENERIC_CONFIRMATION", name: "Checkmark" },
  { id: "BIRTHDAY_EVENT", name: "Birthday" },
  { id: "GLUCOSE_MONITOR", name: "Health" },
  { id: "REACHED_FITNESS_GOAL", name: "Goal" },
  { id: "GENERIC_EMAIL", name: "Email" },
  { id: "GENERIC_SMS", name: "Message" },
  { id: "MUSIC_EVENT", name: "Music" },
  { id: "PAY_BILL", name: "Bill/Task" },
  { id: "HOCKEY_GAME", name: "Hockey" },
  { id: "BASKETBALL", name: "Basketball" },
  { id: "SOCCER_GAME", name: "Soccer" },
  { id: "AMERICAN_FOOTBALL", name: "Football" }
];

function getEventConfig(eventType) {
  switch (eventType) {
    case EVENT_BOTTLE:
      return { name: config.event1Name || defaultConfig.event1Name, icon: config.event1Icon || defaultConfig.event1Icon };
    case EVENT_DIAPER:
      return { name: config.event2Name || defaultConfig.event2Name, icon: config.event2Icon || defaultConfig.event2Icon };
    case EVENT_SLEEP_START:
      return { name: config.event3Name || defaultConfig.event3Name, icon: config.event3Icon || defaultConfig.event3Icon };
    case EVENT_SLEEP_END:
      return { name: config.event4Name || defaultConfig.event4Name, icon: config.event4Icon || defaultConfig.event4Icon };
    default:
      return { name: 'Unknown Event', icon: 'system://images/NOTIFICATION_FLAG' };
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

function createEventPin(eventType, timestamp) {
  var eventCfg = getEventConfig(eventType);
  
  var date = new Date(timestamp * 1000);
  var isoTime = date.toISOString();
  var pinId = 'baby-watch-' + eventType + '-' + timestamp;
  
  var pin = {
    "id": pinId,
    "time": isoTime,
    "layout": {
      "type": "genericPin",
      "title": eventCfg.name,
      "body": "Logged at " + formatTime(timestamp),
      "tinyIcon": eventCfg.icon
    },
    "reminders": [{
      "time": isoTime,
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

// Generate settings page HTML
function generateSettingsPage() {
  var iconOptions = availableIcons.map(function(icon) {
    return '<option value="system://images/' + icon.id + '">' + icon.name + '</option>';
  }).join('\n');
  
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
    '</style>\n' +
    '</head><body>\n' +
    '<h1>Baby Watch Settings</h1>\n' +
    
    '<div class="section">\n' +
    '<h2>Event 1 (Up Button)</h2>\n' +
    '<label>Event Name</label>\n' +
    '<input type="text" id="event1Name" value="' + (config.event1Name || defaultConfig.event1Name) + '" placeholder="Bottle Feed">\n' +
    '<label>Timeline Icon</label>\n' +
    '<select id="event1Icon">' + iconOptions + '</select>\n' +
    '</div>\n' +
    
    '<div class="section">\n' +
    '<h2>Event 2 (Select Button)</h2>\n' +
    '<label>Event Name</label>\n' +
    '<input type="text" id="event2Name" value="' + (config.event2Name || defaultConfig.event2Name) + '" placeholder="Diaper Change">\n' +
    '<label>Timeline Icon</label>\n' +
    '<select id="event2Icon">' + iconOptions + '</select>\n' +
    '</div>\n' +
    
    '<div class="section">\n' +
    '<h2>Event 3 (Down Button - Start)</h2>\n' +
    '<label>Event Name</label>\n' +
    '<input type="text" id="event3Name" value="' + (config.event3Name || defaultConfig.event3Name) + '" placeholder="Sleep Started">\n' +
    '<label>Timeline Icon</label>\n' +
    '<select id="event3Icon">' + iconOptions + '</select>\n' +
    '</div>\n' +
    
    '<div class="section">\n' +
    '<h2>Event 4 (Down Button - End)</h2>\n' +
    '<label>Event Name</label>\n' +
    '<input type="text" id="event4Name" value="' + (config.event4Name || defaultConfig.event4Name) + '" placeholder="Sleep Ended">\n' +
    '<label>Timeline Icon</label>\n' +
    '<select id="event4Icon">' + iconOptions + '</select>\n' +
    '</div>\n' +
    
    '<button class="btn btn-save" onclick="saveSettings()">Save Settings</button>\n' +
    '<button class="btn btn-reset" onclick="resetDefaults()">Reset to Defaults</button>\n' +
    
    '<script>\n' +
    'function setSelectValue(id, value) { var s = document.getElementById(id); for(var i=0; i<s.options.length; i++) { if(s.options[i].value === value) { s.selectedIndex = i; break; } } }\n' +
    'setSelectValue("event1Icon", "' + (config.event1Icon || defaultConfig.event1Icon) + '");\n' +
    'setSelectValue("event2Icon", "' + (config.event2Icon || defaultConfig.event2Icon) + '");\n' +
    'setSelectValue("event3Icon", "' + (config.event3Icon || defaultConfig.event3Icon) + '");\n' +
    'setSelectValue("event4Icon", "' + (config.event4Icon || defaultConfig.event4Icon) + '");\n' +
    'function saveSettings() {\n' +
    '  var cfg = {\n' +
    '    event1Name: document.getElementById("event1Name").value,\n' +
    '    event1Icon: document.getElementById("event1Icon").value,\n' +
    '    event2Name: document.getElementById("event2Name").value,\n' +
    '    event2Icon: document.getElementById("event2Icon").value,\n' +
    '    event3Name: document.getElementById("event3Name").value,\n' +
    '    event3Icon: document.getElementById("event3Icon").value,\n' +
    '    event4Name: document.getElementById("event4Name").value,\n' +
    '    event4Icon: document.getElementById("event4Icon").value\n' +
    '  };\n' +
    '  var result = encodeURIComponent(JSON.stringify(cfg));\n' +
    '  window.location.href = "pebblejs://close#" + result;\n' +
    '}\n' +
    'function resetDefaults() {\n' +
    '  document.getElementById("event1Name").value = "Bottle Feed";\n' +
    '  document.getElementById("event2Name").value = "Diaper Change";\n' +
    '  document.getElementById("event3Name").value = "Sleep Started";\n' +
    '  document.getElementById("event4Name").value = "Sleep Ended";\n' +
    '  setSelectValue("event1Icon", "system://images/DINNER_RESERVATION");\n' +
    '  setSelectValue("event2Icon", "system://images/SCHEDULED_EVENT");\n' +
    '  setSelectValue("event3Icon", "system://images/TIDE_IS_HIGH");\n' +
    '  setSelectValue("event4Icon", "system://images/ALARM_CLOCK");\n' +
    '}\n' +
    '</script>\n' +
    '</body></html>';
  
  return html;
}

Pebble.addEventListener('ready', function() {
  console.log('=== BABY WATCH JS READY ===');
  console.log('Timeline: Rebble API');
  console.log('Config: ' + JSON.stringify(config));
  
  Pebble.getTimelineToken(function(token) {
    console.log('Timeline token OK: ' + token.substring(0, 15) + '...');
  }, function(error) {
    console.log('Timeline token FAILED: ' + error);
  });
});

Pebble.addEventListener('showConfiguration', function() {
  var html = generateSettingsPage();
  var dataUri = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  Pebble.openURL(dataUri);
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (e && e.response) {
    try {
      var newConfig = JSON.parse(decodeURIComponent(e.response));
      config = newConfig;
      localStorage.setItem('babyWatchConfig', JSON.stringify(config));
      console.log('Settings saved: ' + JSON.stringify(config));
    } catch (err) {
      console.log('Error parsing config: ' + err);
    }
  }
});

Pebble.addEventListener('appmessage', function(e) {
  console.log('=== APPMESSAGE RECEIVED ===');
  console.log('Payload: ' + JSON.stringify(e.payload));
  
  var eventType = getPayloadValue(e.payload, 'EVENT_TYPE', KEY_EVENT_TYPE);
  var timestamp = getPayloadValue(e.payload, 'EVENT_TIME', KEY_EVENT_TIME);
  
  console.log('eventType=' + eventType + ', timestamp=' + timestamp);
  
  if (eventType !== undefined && timestamp !== undefined) {
    pushTimelinePin(eventType, timestamp);
  } else {
    console.log('ERROR: Missing data. Keys: ' + Object.keys(e.payload).join(', '));
  }
});
