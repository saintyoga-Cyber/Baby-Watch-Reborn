// Timeline API Configuration
// Change this to switch between backends:
// - 'rebble'  : Rebble services (current, works with old Pebble app)
// - 'core'    : Core Devices (for new Core 2 watches - update URL when available)
// - 'custom'  : Use CUSTOM_API_URL below
var TIMELINE_BACKEND = 'rebble';

// Backend URLs
var BACKEND_URLS = {
  'rebble': 'https://timeline-api.rebble.io/',
  'core': 'https://timeline-api.rebble.io/',  // Update when Core Devices releases their API
  'custom': ''  // Set your custom URL here if needed
};

// Custom API URL (only used if TIMELINE_BACKEND = 'custom')
var CUSTOM_API_URL = '';

// Get the active API URL
function getApiUrl() {
  if (TIMELINE_BACKEND === 'custom' && CUSTOM_API_URL) {
    return CUSTOM_API_URL;
  }
  return BACKEND_URLS[TIMELINE_BACKEND] || BACKEND_URLS['rebble'];
}

/**
 * Send a request to the Pebble public web timeline API.
 * @param pin The JSON pin to insert. Must contain 'id' field.
 * @param type The type of request, either PUT or DELETE.
 * @param topics Array of topics if a shared pin, 'null' otherwise.
 * @param apiKey Timeline API key for this app, available from dev-portal.getpebble.com
 * @param callback The callback to receive the responseText after the request has completed.
 */
function timelineRequest(pin, type, topics, apiKey, callback) {
  var apiUrl = getApiUrl();
  
  // User or shared?
  var url = apiUrl + 'v1/' + ((topics != null) ? 'shared/' : 'user/') + 'pins/' + pin.id;

  console.log('timeline: using backend: ' + TIMELINE_BACKEND + ' (' + apiUrl + ')');

  // Create XHR
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    console.log('timeline: response received: ' + this.responseText);
    callback(this.responseText);
  };
  xhr.onerror = function() {
    console.log('timeline: request error');
    callback('{"error": "Request failed"}');
  };
  xhr.open(type, url);

  // Set headers
  xhr.setRequestHeader('Content-Type', 'application/json');
  if(topics != null) {
    xhr.setRequestHeader('X-Pin-Topics', '' + topics.join(','));
    xhr.setRequestHeader('X-API-Key', '' + apiKey);
  }

  // Get token
  Pebble.getTimelineToken(function(token) {
    // Add headers
    xhr.setRequestHeader('X-User-Token', '' + token);

    // Send
    xhr.send(JSON.stringify(pin));
    console.log('timeline: request sent to ' + url);
  }, function(error) { 
    console.log('timeline: error getting timeline token: ' + error); 
    callback('{"error": "Failed to get timeline token: ' + error + '"}');
  });
}

/**
 * Insert a pin into the timeline for this user.
 * @param pin The JSON pin to insert.
 * @param callback The callback to receive the responseText after the request has completed.
 */
function insertUserPin(pin, callback) {
  timelineRequest(pin, 'PUT', null, null, callback);
}

/**
 * Delete a pin from the timeline for this user.
 * @param pin The JSON pin to delete.
 * @param callback The callback to receive the responseText after the request has completed.
 */
function deleteUserPin(pin, callback) {
  timelineRequest(pin, 'DELETE', null, null, callback);
}

/**
 * Get the current backend name
 */
function getBackendName() {
  return TIMELINE_BACKEND;
}

// Export
module.exports.insertUserPin = insertUserPin;
module.exports.deleteUserPin = deleteUserPin;
module.exports.getBackendName = getBackendName;