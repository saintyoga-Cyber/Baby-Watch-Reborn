var timeline = require('./timeline');

// Event type constants - must match C code
var EVENT_BOTTLE = 1;
var EVENT_DIAPER = 2;
var EVENT_SLEEP_START = 3;
var EVENT_SLEEP_END = 4;

// Message key indices (as defined in package.json messageKeys array order)
var KEY_EVENT_TYPE = 0;
var KEY_EVENT_TIME = 1;

// Icon and config mapping for different events
var eventConfig = {
  1: { name: 'Bottle Feed', icon: 'system://images/DINNER_RESERVATION' },
  2: { name: 'Diaper Change', icon: 'system://images/SCHEDULED_EVENT' },
  3: { name: 'Sleep Started', icon: 'system://images/TIDE_IS_HIGH' },
  4: { name: 'Sleep Ended', icon: 'system://images/ALARM_CLOCK' }
};

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
  var config = eventConfig[eventType];
  if (!config) {
    console.log('Unknown event type: ' + eventType);
    return null;
  }
  
  var date = new Date(timestamp * 1000);
  var isoTime = date.toISOString();
  var pinId = 'baby-watch-' + eventType + '-' + timestamp;
  
  // Pin structure based on Bobby assistant (which works with Rebble)
  var pin = {
    "id": pinId,
    "time": isoTime,
    "layout": {
      "type": "genericPin",
      "title": config.name,
      "body": "Logged at " + formatTime(timestamp),
      "tinyIcon": config.icon
    },
    "reminders": [{
      "time": isoTime,
      "layout": {
        "type": "genericReminder",
        "title": config.name,
        "tinyIcon": config.icon
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

// Helper to get value from payload - tries both string name and numeric index
function getPayloadValue(payload, stringKey, numericKey) {
  if (payload[stringKey] !== undefined) {
    return payload[stringKey];
  }
  if (payload[numericKey] !== undefined) {
    return payload[numericKey];
  }
  return undefined;
}

Pebble.addEventListener('ready', function() {
  console.log('=== BABY WATCH JS READY ===');
  console.log('Timeline: Rebble API');
  
  Pebble.getTimelineToken(function(token) {
    console.log('Timeline token OK: ' + token.substring(0, 15) + '...');
  }, function(error) {
    console.log('Timeline token FAILED: ' + error);
  });
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
