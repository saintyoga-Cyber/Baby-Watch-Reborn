/***** Persist Keys *****/
var PERSIST_BOTTLE = 1;
var PERSIST_DIAPER = 2;
var PERSIST_MOON_START = 3;
var PERSIST_MOON_END = 4;

var memoryArray = {};

// Settings page hosted on GitHub Pages - simple URL without hash data
var SETTINGS_PAGE = 'https://saintyoga-cyber.github.io/Baby-Watch-Reborn/settings.html';

Pebble.addEventListener("ready",
function(e) {
  console.log("Baby Watch Reborn JS Ready!");
  memoryArray[PERSIST_BOTTLE] = [];
  memoryArray[PERSIST_DIAPER] = [];
  memoryArray[PERSIST_MOON_START] = [];
  memoryArray[PERSIST_MOON_END] = [];
  
  if (typeof(window.localStorage[PERSIST_BOTTLE]) !== 'undefined') {
    memoryArray[PERSIST_BOTTLE] = JSON.parse(window.localStorage[PERSIST_BOTTLE]);
  }
  if (typeof(window.localStorage[PERSIST_DIAPER]) !== 'undefined') {
    memoryArray[PERSIST_DIAPER] = JSON.parse(window.localStorage[PERSIST_DIAPER]);
  }
  if (typeof(window.localStorage[PERSIST_MOON_START]) !== 'undefined') {
    memoryArray[PERSIST_MOON_START] = JSON.parse(window.localStorage[PERSIST_MOON_START]);
  }
  if (typeof(window.localStorage[PERSIST_MOON_END]) !== 'undefined') {
    memoryArray[PERSIST_MOON_END] = JSON.parse(window.localStorage[PERSIST_MOON_END]);
  }
}
);

Pebble.addEventListener("appmessage",
function(e) {
  console.log("AppMessage received: " + JSON.stringify(e.payload));
  var updated = [];
  for (var v in e.payload) {
    if (e.payload.hasOwnProperty(v)) {
      v = parseInt(v, 10);
      if (typeof(memoryArray[v]) === 'undefined') {
        memoryArray[v] = [];
      }
      if (updated.indexOf(v) == -1) {
        updated.push(v);
      }
      memoryArray[v].push(e.payload[v]);
    }
  }

  for (var i = 0; i < updated.length; ++i) {
    console.log("Updating localStorage[" + updated[i] + "], new value: " + JSON.stringify(memoryArray[updated[i]]));
    window.localStorage[updated[i]] = JSON.stringify(memoryArray[updated[i]]);
  }
}
);

Pebble.addEventListener("showConfiguration",
function(e) {
  console.log("Opening settings page: " + SETTINGS_PAGE);
  Pebble.openURL(SETTINGS_PAGE);
}
);

Pebble.addEventListener("webviewclosed",
function(e) {
  console.log("Configuration window returned: " + e.response);
  if (e.response == "reset") {
    console.log("Local Storage cleared");
    for (var v in window.localStorage) {
      window.localStorage.removeItem(v);
    }
    window.localStorage.clear();
    Pebble.sendAppMessage({"0": "reset" });
    memoryArray[PERSIST_BOTTLE] = [];
    memoryArray[PERSIST_DIAPER] = [];
    memoryArray[PERSIST_MOON_START] = [];
    memoryArray[PERSIST_MOON_END] = [];
    window.localStorage[PERSIST_BOTTLE] = JSON.stringify(memoryArray[PERSIST_BOTTLE]);
    window.localStorage[PERSIST_DIAPER] = JSON.stringify(memoryArray[PERSIST_DIAPER]);
    window.localStorage[PERSIST_MOON_START] = JSON.stringify(memoryArray[PERSIST_MOON_START]);
    window.localStorage[PERSIST_MOON_END] = JSON.stringify(memoryArray[PERSIST_MOON_END]);
  }
}
);
