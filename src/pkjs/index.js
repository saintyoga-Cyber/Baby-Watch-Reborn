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
  // Serialize only the values needed by the page — icons are rebuilt in JS
  var vals = {
    n1: config.event1Name || defaultConfig.event1Name,
    i1: config.event1Icon || defaultConfig.event1Icon,
    n2: config.event2Name || defaultConfig.event2Name,
    i2: config.event2Icon || defaultConfig.event2Icon,
    n3: config.event3Name || defaultConfig.event3Name,
    i3: config.event3Icon || defaultConfig.event3Icon,
    n4: config.event4Name || defaultConfig.event4Name,
    i4: config.event4Icon || defaultConfig.event4Icon,
    n5: config.event5Name || defaultConfig.event5Name,
    i5: config.event5Icon || defaultConfig.event5Icon,
    haUrl:      config.haUrl      || '',
    haToken:    config.haToken    || '',
    haDeviceId: config.haDeviceId || ''
  };

  // Icon data injected once; selects are populated by JS on load
  var iconsJson = JSON.stringify(availableIcons.map(function(ic) {
    return [ic.id, ic.name];
  }));

  var html = '<!DOCTYPE html><html><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Baby Watch</title>' +
    '<style>' +
    'body{font-family:sans-serif;padding:16px;background:#1a1a2e;color:#eee;margin:0}' +
    'h1{color:#4cc9f0;font-size:22px;margin-bottom:16px;text-align:center}' +
    '.s{background:#16213e;border-radius:10px;padding:14px;margin-bottom:14px}' +
    '.s h2{color:#4cc9f0;font-size:15px;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid #0f3460}' +
    'label{display:block;color:#aaa;font-size:11px;margin-bottom:3px}' +
    'input,select{width:100%;padding:10px;border:1px solid #0f3460;border-radius:7px;background:#0f3460;color:#fff;font-size:15px;margin-bottom:10px;box-sizing:border-box}' +
    '.btn{display:block;width:100%;padding:14px;border:none;border-radius:7px;font-size:17px;font-weight:600;cursor:pointer;margin-top:8px}' +
    '.save{background:#4cc9f0;color:#1a1a2e}' +
    '.reset{background:transparent;border:1px solid #666;color:#aaa}' +
    '.note{color:#888;font-size:11px;margin:-6px 0 10px}' +
    '</style></head><body>' +
    '<h1>Baby Watch Settings</h1>' +
    '<div class="s"><h2>Bottle Feed</h2>' +
      '<label>Name</label><input id="n1" value="' + vals.n1 + '">' +
      '<label>Icon</label><select id="i1"></select></div>' +
    '<div class="s"><h2>Breastfeed</h2>' +
      '<label>Name</label><input id="n2" value="' + vals.n2 + '">' +
      '<label>Icon</label><select id="i2"></select></div>' +
    '<div class="s"><h2>Diaper Change</h2>' +
      '<label>Name</label><input id="n3" value="' + vals.n3 + '">' +
      '<label>Icon</label><select id="i3"></select></div>' +
    '<div class="s"><h2>Sleep Started</h2>' +
      '<label>Name</label><input id="n4" value="' + vals.n4 + '">' +
      '<label>Icon</label><select id="i4"></select></div>' +
    '<div class="s"><h2>Sleep Ended</h2>' +
      '<label>Name</label><input id="n5" value="' + vals.n5 + '">' +
      '<label>Icon</label><select id="i5"></select></div>' +
    '<div class="s"><h2>Home Assistant</h2>' +
      '<label>HA URL</label>' +
      '<input id="haUrl" value="' + vals.haUrl + '" placeholder="http://homeassistant.local:8123">' +
      '<label>Long-Lived Access Token</label>' +
      '<input id="haToken" type="password" value="' + vals.haToken + '" placeholder="eyJ0...">' +
      '<p class="note">HA → Profile → Long-Lived Access Tokens</p>' +
      '<label>Child Device ID</label>' +
      '<input id="haDeviceId" value="' + vals.haDeviceId + '" placeholder="abc123...">' +
      '<p class="note">HA → Settings → Devices → your child\'s device</p>' +
    '</div>' +
    '<button class="btn save"  onclick="save()">Save</button>' +
    '<button class="btn reset" onclick="rst()">Reset Defaults</button>' +
    '<script>' +
    'var icons=' + iconsJson + ';' +
    'var cur=["' + vals.i1 + '","' + vals.i2 + '","' + vals.i3 + '","' + vals.i4 + '","' + vals.i5 + '"];' +
    'icons.forEach(function(ic){' +
    '  var o="<option value=\'system://images/"+ic[0]+"\'>" + ic[1] + "</option>";' +
    '  for(var k=1;k<=5;k++){document.getElementById("i"+k).innerHTML+=o;}' +
    '});' +
    'for(var k=1;k<=5;k++){' +
    '  var s=document.getElementById("i"+k);' +
    '  for(var j=0;j<s.options.length;j++){if(s.options[j].value===cur[k-1]){s.selectedIndex=j;break;}}' +
    '}' +
    'function v(id){return document.getElementById(id).value;}' +
    'function save(){' +
    '  var cfg={' +
    '    event1Name:v("n1"),event1Icon:v("i1"),' +
    '    event2Name:v("n2"),event2Icon:v("i2"),' +
    '    event3Name:v("n3"),event3Icon:v("i3"),' +
    '    event4Name:v("n4"),event4Icon:v("i4"),' +
    '    event5Name:v("n5"),event5Icon:v("i5"),' +
    '    haUrl:v("haUrl"),haToken:v("haToken"),haDeviceId:v("haDeviceId")' +
    '  };' +
    '  window.location.href="pebblejs://close#"+encodeURIComponent(JSON.stringify(cfg));' +
    '}' +
    'function rst(){' +
    '  document.getElementById("n1").value="Bottle Feed";' +
    '  document.getElementById("n2").value="Breastfeed";' +
    '  document.getElementById("n3").value="Diaper Change";' +
    '  document.getElementById("n4").value="Sleep Started";' +
    '  document.getElementById("n5").value="Sleep Ended";' +
    '  document.getElementById("haUrl").value="";' +
    '  document.getElementById("haToken").value="";' +
    '  document.getElementById("haDeviceId").value="";' +
    '}' +
    '<\/script></body></html>';

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
