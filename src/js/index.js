var timeline = require('./timeline');

// Event type constants - must match C code
var EVENT_BOTTLE = 1;
var EVENT_DIAPER = 2;
var EVENT_SLEEP_START = 3;
var EVENT_SLEEP_END = 4;

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

Pebble.addEventListener('ready', function() {
  console.log('PebbleKit JS ready! Timeline support enabled.');
});

Pebble.addEventListener('appmessage', function(e) {
  console.log('Received appmessage: ' + JSON.stringify(e.payload));
  
  var eventType = e.payload['EVENT_TYPE'];
  var timestamp = e.payload['EVENT_TIME'];
  
  if (eventType && timestamp) {
    pushTimelinePin(eventType, timestamp);
  }
});