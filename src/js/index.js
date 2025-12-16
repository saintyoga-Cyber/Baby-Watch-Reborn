var timeline = require('./timeline');

// Event type constants - must match C code
var EVENT_BOTTLE = 1;
var EVENT_DIAPER = 2;
var EVENT_SLEEP_START = 3;
var EVENT_SLEEP_END = 4;

// Message key indices (as defined in package.json messageKeys array order)
var KEY_EVENT_TYPE = 0;
var KEY_EVENT_TIME = 1;

// Icon mapping for different events
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
  var pinId = 'baby-watch-' + eventType + '-' + timestamp;
  
  var pin = {
    'id': pinId,
    'time': date.toISOString(),
    'layout': {
      'type': 'genericPin',
      'title': config.name,
      'body': 'Logged at ' + formatTime(timestamp),
      'tinyIcon': config.icon
    }
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
  // Try string key first (SDK 3 with enableMultiJS)
  if (payload[stringKey] !== undefined) {
    return payload[stringKey];
  }
  // Try numeric key (fallback)
  if (payload[numericKey] !== undefined) {
    return payload[numericKey];
  }
  return undefined;
}

Pebble.addEventListener('ready', function() {
  console.log('=== BABY WATCH JS READY ===');
  console.log('Timeline support: Rebble API');
  
  // Test timeline token on startup
  Pebble.getTimelineToken(function(token) {
    console.log('Timeline token OK: ' + token.substring(0, 15) + '...');
  }, function(error) {
    console.log('Timeline token FAILED: ' + error);
    console.log('Make sure your watch is connected to Rebble services!');
  });
});

Pebble.addEventListener('appmessage', function(e) {
  console.log('=== APPMESSAGE RECEIVED ===');
  console.log('Raw payload: ' + JSON.stringify(e.payload));
  
  // Try both string keys and numeric keys
  var eventType = getPayloadValue(e.payload, 'EVENT_TYPE', KEY_EVENT_TYPE);
  var timestamp = getPayloadValue(e.payload, 'EVENT_TIME', KEY_EVENT_TIME);
  
  console.log('eventType: ' + eventType + ' (type: ' + typeof eventType + ')');
  console.log('timestamp: ' + timestamp + ' (type: ' + typeof timestamp + ')');
  
  if (eventType !== undefined && timestamp !== undefined) {
    console.log('Creating timeline pin...');
    pushTimelinePin(eventType, timestamp);
  } else {
    console.log('ERROR: Missing eventType or timestamp');
    console.log('Available keys: ' + Object.keys(e.payload).join(', '));
  }
});
