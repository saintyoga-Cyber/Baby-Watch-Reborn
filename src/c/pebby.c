#include "pebble.h"
#include <math.h>
#include <string.h>
#include <time.h>


/***** Useful Macros *****/

#define MAX(a, b) (( a > b)? a : b)

/***** Persist Keys *****/
#define PERSIST_BOTTLE 1
#define PERSIST_DIAPER 2
#define PERSIST_MOON_START 3
#define PERSIST_MOON_END 4

/***** Timeline Event Types *****/
#define EVENT_BOTTLE 1
#define EVENT_DIAPER 2
#define EVENT_SLEEP_START 3
#define EVENT_SLEEP_END 4


/***** Variables *****/

static Window *window;

// Background layers for colored rows
#ifdef PBL_COLOR
static Layer *bottleBgLayer;
static Layer *diaperBgLayer;
static Layer *moonBgLayer;
#endif

// Texts

static TextLayer *bottleTextLayer;
static char timeTextUp[] = "00:00";
static TextLayer *bottleSinceTextLayer;
static char timeSinceTextUp[] = "(99 minutes ago)";

static TextLayer *diaperTextLayer;
static char timeTextMiddle[] = "00:00";
static TextLayer *diaperSinceTextLayer;
static char timeSinceTextMiddle[] = "(99 minutes ago)";

static TextLayer *moonTextLayer;
static char timeTextDown[14] = "";
static TextLayer *moonSinceTextLayer;
static char timeSinceTextDown[] = "(99 minutes ago)";

// Action Bar

static GBitmap *actionBottle;
static GBitmap *actionDiaper;
static GBitmap *actionMoon;

static ActionBarLayer *actionBar;

// Data

static int sleeping = 0;
static time_t bottleStart = 0;
static time_t diaperStart = 0;
static time_t sleepStart = 0;
static time_t sleepEnd = 0;


/***** Background Layer Draw Callbacks *****/
#ifdef PBL_COLOR
static void bottle_bg_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  graphics_context_set_fill_color(ctx, GColorOrange);
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);
}

static void diaper_bg_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  graphics_context_set_fill_color(ctx, GColorChromeYellow);
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);
}

static void moon_bg_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  graphics_context_set_fill_color(ctx, GColorPictonBlue);
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);
}
#endif


/***** Util *****/

static void setTimeText(time_t timestamp, char *text, TextLayer *textLayer) {
  if (timestamp == 0) {
    text[0] = '\0';
  } else {
    struct tm *time = localtime(&timestamp);
    strftime(text, sizeof(timeTextUp), (clock_is_24h_style()? "%H:%M" : "%I:%M"), time);
  }
  text_layer_set_text(textLayer, text);
}

static void setTimeSinceText(time_t timestamp, char *text, TextLayer *textLayer) {
  if (timestamp > 0) {
    time_t now = time(NULL);
    time_t elapsed = now - timestamp;

    if (elapsed < 60) {
      strcpy(text, "(just now)");
    } else if (elapsed < 3600) {
      int minutes = ceil((double) elapsed / 60);
      snprintf(text, sizeof(timeSinceTextUp), "(%d min ago)", minutes);
    } else {
      int hours = elapsed / 3600;
      snprintf(text, sizeof(timeSinceTextUp), "(%d h ago)", hours);
    }
  } else {
    text[0] = '\0';
  }

  text_layer_set_text(textLayer, text);
}


static void setTimeRangeText(time_t startTimestamp, time_t endTimestamp, char *text, TextLayer *textLayer) {
  char sleepStartStr[] = "00:00";
  char sleepEndStr[] = "00:00";

  if (startTimestamp == 0 && endTimestamp == 0) {
    text[0] = '\0';
  } else {
    struct tm *time = localtime(&startTimestamp);

    strftime(sleepStartStr, sizeof(sleepStartStr), (clock_is_24h_style()? "%H:%M" : "%I:%M"), time);

    if (endTimestamp != 0) {
      time = localtime(&endTimestamp);
      strftime(sleepEndStr, sizeof(sleepEndStr), (clock_is_24h_style()? "%H:%M" : "%I:%M"), time);
    } else {
      strcpy(sleepEndStr, "...");
    }

    strncpy(text, sleepStartStr, sizeof(sleepStartStr));
    strncat(text, " - ", 4);
    strncat(text, sleepEndStr, sizeof(sleepEndStr));
  }

  text_layer_set_text(textLayer, text);
}


/***** Click Provider *****/

void sendToPhone(int key, time_t message) {
  DictionaryIterator *iter;
  app_message_outbox_begin(&iter);
  Tuplet value = TupletInteger(key, message);
  dict_write_tuplet(iter, &value);
  app_message_outbox_send();
}

void sendTimelineEvent(int eventType, time_t timestamp) {
  DictionaryIterator *iter;
  app_message_outbox_begin(&iter);
  dict_write_int32(iter, MESSAGE_KEY_EVENT_TYPE, eventType);
  dict_write_int32(iter, MESSAGE_KEY_EVENT_TIME, (int32_t)timestamp);
  app_message_outbox_send();
  app_log(APP_LOG_LEVEL_DEBUG, "pebby.c", 160, "Timeline event sent: type=%d, time=%ld", eventType, timestamp);
}

void up_single_click_handler(ClickRecognizerRef recognizer, void *context) {
  ButtonId bt = click_recognizer_get_button_id(recognizer);
  char *targetText = timeTextUp;
  TextLayer *targetLayer = bottleTextLayer;
  int persistKey = PERSIST_BOTTLE;
  int eventType = EVENT_BOTTLE;

  time_t t = time(NULL);

  if (bt == BUTTON_ID_SELECT) {
    targetText = timeTextMiddle;
    targetLayer = diaperTextLayer;
    persistKey = PERSIST_DIAPER;
    eventType = EVENT_DIAPER;
    diaperStart = t;
    setTimeSinceText(diaperStart, timeSinceTextMiddle, diaperSinceTextLayer);
  } else {
    bottleStart = t;
    setTimeSinceText(bottleStart, timeSinceTextUp, bottleSinceTextLayer);
  }

  setTimeText(t, targetText, targetLayer);

  persist_write_int(persistKey, t);

  sendTimelineEvent(eventType, t);
}

void down_single_click_handler(ClickRecognizerRef recognizer, void *context) {
  time_t t = time(NULL);

  if (sleeping == 0) {
    sleeping = 1;
    sleepStart = t;
    sleepEnd = 0;

    persist_write_int(PERSIST_MOON_START, sleepStart);
    persist_write_int(PERSIST_MOON_END, 0);

    sendTimelineEvent(EVENT_SLEEP_START, t);
  } else {
    sleeping = 0;
    sleepEnd = t;

    persist_write_int(PERSIST_MOON_END, sleepEnd);

    sendTimelineEvent(EVENT_SLEEP_END, t);
  }

  setTimeRangeText(sleepStart, sleepEnd, timeTextDown, moonTextLayer);
  setTimeSinceText(MAX(sleepStart, sleepEnd), timeSinceTextDown, moonSinceTextLayer);
}


void config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_UP, up_single_click_handler);
  window_single_click_subscribe(BUTTON_ID_SELECT, up_single_click_handler);
  window_single_click_subscribe(BUTTON_ID_DOWN, down_single_click_handler);
}

void handle_tick(struct tm *tick_time, TimeUnits units_changed) {
  setTimeSinceText(bottleStart, timeSinceTextUp, bottleSinceTextLayer);
  setTimeSinceText(diaperStart, timeSinceTextMiddle, diaperSinceTextLayer);
  setTimeSinceText(MAX(sleepStart, sleepEnd), timeSinceTextDown, moonSinceTextLayer);
}


/***** Message handlers *****/

void out_sent_handler(DictionaryIterator *sent, void *context) {
  app_log(APP_LOG_LEVEL_DEBUG, "pebby.c", 145, "Pebble: Out message delivered");
}


void out_failed_handler(DictionaryIterator *failed, AppMessageResult reason, void *context) {
  char logMsg[64];
  snprintf(logMsg, 64, "Pebble: Out message failed, reason: %d", reason);
  app_log(APP_LOG_LEVEL_DEBUG, "pebby.c", 201, logMsg);
  if (reason != APP_MSG_SEND_TIMEOUT) {
    return;
  }
  app_log(APP_LOG_LEVEL_DEBUG, "pebby.c", 205, "Retrying message send...");

  DictionaryIterator *iter;
  app_message_outbox_begin(&iter);
  uint32_t sizes[] = {64, 64};
  dict_merge(iter, sizes, failed, 0, NULL, NULL);
  app_message_outbox_send();
}


void in_received_handler(DictionaryIterator *received, void *context) {
  app_log(APP_LOG_LEVEL_DEBUG, "pebby.c", 157, "Pebble: In message received");

  Tuple *text_tuple = dict_find(received, 0);

  if (text_tuple) {
    app_log(APP_LOG_LEVEL_DEBUG, "pebby.c", 169, "Received message: %s", text_tuple->value->cstring);
    if (strcmp(text_tuple->value->cstring, "reset") == 0) {
      persist_write_int(PERSIST_BOTTLE, 0);
      persist_write_int(PERSIST_DIAPER, 0);
      persist_write_int(PERSIST_MOON_START, 0);
      persist_write_int(PERSIST_MOON_END, 0);

      timeTextUp[0] = '\0';
      timeTextMiddle[0] = '\0';
      timeTextDown[0] = '\0';

      text_layer_set_text(bottleTextLayer, timeTextUp);
      text_layer_set_text(diaperTextLayer, timeTextMiddle);
      text_layer_set_text(moonTextLayer, timeTextDown);

      timeSinceTextUp[0] = '\0';
      timeSinceTextMiddle[0] = '\0';
      timeSinceTextDown[0] = '\0';

      text_layer_set_text(bottleSinceTextLayer, timeSinceTextUp);
      text_layer_set_text(diaperSinceTextLayer, timeSinceTextMiddle);
      text_layer_set_text(moonSinceTextLayer, timeSinceTextDown);
    }
  }
}


void in_dropped_handler(AppMessageResult reason, void *context) {
  app_log(APP_LOG_LEVEL_DEBUG, "pebby.c", 163, "Pebble: In message failed");
}



/***** App *****/

static void window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);
  bounds.size.h -= 6;

  int contentWidth = bounds.size.w - ACTION_BAR_WIDTH;
  int rowHeight = bounds.size.h / 3;

  // Create colored background layers (only on color devices)
  #ifdef PBL_COLOR
  bottleBgLayer = layer_create((GRect){ .origin = {0, 0}, .size = {contentWidth, rowHeight} });
  layer_set_update_proc(bottleBgLayer, bottle_bg_update_proc);
  layer_add_child(window_layer, bottleBgLayer);

  diaperBgLayer = layer_create((GRect){ .origin = {0, rowHeight}, .size = {contentWidth, rowHeight} });
  layer_set_update_proc(diaperBgLayer, diaper_bg_update_proc);
  layer_add_child(window_layer, diaperBgLayer);

  moonBgLayer = layer_create((GRect){ .origin = {0, rowHeight * 2}, .size = {contentWidth, rowHeight + 6} });
  layer_set_update_proc(moonBgLayer, moon_bg_update_proc);
  layer_add_child(window_layer, moonBgLayer);
  #endif

  // Text layers - using original positioning from Pebby

  bottleSinceTextLayer = text_layer_create((GRect){ .origin = {0, bounds.size.h/3/2 + 2 }, .size = {contentWidth, 24} });
  text_layer_set_text_alignment(bottleSinceTextLayer, GTextAlignmentCenter);
  text_layer_set_text(bottleSinceTextLayer, "");
  text_layer_set_font(bottleSinceTextLayer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  #ifdef PBL_COLOR
  text_layer_set_background_color(bottleSinceTextLayer, GColorClear);
  text_layer_set_text_color(bottleSinceTextLayer, GColorBlack);
  #endif
  layer_add_child(window_layer, text_layer_get_layer(bottleSinceTextLayer));

  diaperSinceTextLayer = text_layer_create((GRect){ .origin = {0, bounds.size.h/2 + 2 }, .size = {contentWidth, 24} });
  text_layer_set_font(diaperSinceTextLayer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  text_layer_set_text_alignment(diaperSinceTextLayer, GTextAlignmentCenter);
  text_layer_set_text(diaperSinceTextLayer, "");
  #ifdef PBL_COLOR
  text_layer_set_background_color(diaperSinceTextLayer, GColorClear);
  text_layer_set_text_color(diaperSinceTextLayer, GColorBlack);
  #endif
  layer_add_child(window_layer, text_layer_get_layer(diaperSinceTextLayer));

  moonSinceTextLayer = text_layer_create((GRect){ .origin = {0, 5*bounds.size.h/3/2 + 2 }, .size = {contentWidth, 24} });
  text_layer_set_font(moonSinceTextLayer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  text_layer_set_text_alignment(moonSinceTextLayer, GTextAlignmentCenter);
  text_layer_set_text(moonSinceTextLayer, "");
  #ifdef PBL_COLOR
  text_layer_set_background_color(moonSinceTextLayer, GColorClear);
  text_layer_set_text_color(moonSinceTextLayer, GColorBlack);
  #endif
  layer_add_child(window_layer, text_layer_get_layer(moonSinceTextLayer));


  bottleTextLayer = text_layer_create((GRect){ .origin = {0, bounds.size.h/3/2 - 20 }, .size = {contentWidth, 24} });
  text_layer_set_text_alignment(bottleTextLayer, GTextAlignmentCenter);
  text_layer_set_text(bottleTextLayer, "");
  text_layer_set_font(bottleTextLayer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  #ifdef PBL_COLOR
  text_layer_set_background_color(bottleTextLayer, GColorClear);
  text_layer_set_text_color(bottleTextLayer, GColorBlack);
  #endif
  layer_add_child(window_layer, text_layer_get_layer(bottleTextLayer));

  diaperTextLayer = text_layer_create((GRect){ .origin = {0, bounds.size.h/2 - 20 }, .size = {contentWidth, 24} });
  text_layer_set_font(diaperTextLayer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_text_alignment(diaperTextLayer, GTextAlignmentCenter);
  text_layer_set_text(diaperTextLayer, "");
  #ifdef PBL_COLOR
  text_layer_set_background_color(diaperTextLayer, GColorClear);
  text_layer_set_text_color(diaperTextLayer, GColorBlack);
  #endif
  layer_add_child(window_layer, text_layer_get_layer(diaperTextLayer));

  moonTextLayer = text_layer_create((GRect){ .origin = {0, 5*bounds.size.h/3/2 - 20 }, .size = {contentWidth, 24} });
  text_layer_set_font(moonTextLayer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_text_alignment(moonTextLayer, GTextAlignmentCenter);
  text_layer_set_text(moonTextLayer, "");
  #ifdef PBL_COLOR
  text_layer_set_background_color(moonTextLayer, GColorClear);
  text_layer_set_text_color(moonTextLayer, GColorBlack);
  #endif
  layer_add_child(window_layer, text_layer_get_layer(moonTextLayer));


  // Time values initialization
  if (persist_exists(PERSIST_BOTTLE)) {
    bottleStart = persist_read_int(PERSIST_BOTTLE);
    setTimeText(bottleStart, timeTextUp, bottleTextLayer);
    setTimeSinceText(bottleStart, timeSinceTextUp, bottleSinceTextLayer);
  }

  if (persist_exists(PERSIST_DIAPER)) {
    diaperStart = persist_read_int(PERSIST_DIAPER);
    setTimeText(diaperStart, timeTextMiddle, diaperTextLayer);
    setTimeSinceText(diaperStart, timeSinceTextMiddle, diaperSinceTextLayer);
  }

  if (persist_exists(PERSIST_MOON_START)) {
    sleepStart = persist_read_int(PERSIST_MOON_START);

    sleepEnd = persist_exists(PERSIST_MOON_END)? persist_read_int(PERSIST_MOON_END) : 0;

    if (sleepEnd == 0 && sleepStart != 0) {
      sleeping = 1;
    }

    setTimeRangeText(sleepStart, sleepEnd, timeTextDown, moonTextLayer);
    setTimeSinceText(MAX(sleepStart, sleepEnd), timeSinceTextDown, moonSinceTextLayer);
  }

  // Action Bar
  actionBar = action_bar_layer_create();
  action_bar_layer_add_to_window(actionBar, window);
  action_bar_layer_set_click_config_provider(actionBar, (ClickConfigProvider) config_provider);

  actionBottle = gbitmap_create_with_resource(RESOURCE_ID_ACTION_BOTTLE);
  actionDiaper = gbitmap_create_with_resource(RESOURCE_ID_ACTION_DIAPER);
  actionMoon = gbitmap_create_with_resource(RESOURCE_ID_ACTION_MOON);

  action_bar_layer_set_icon(actionBar, BUTTON_ID_UP, actionBottle);
  action_bar_layer_set_icon(actionBar, BUTTON_ID_SELECT, actionDiaper);
  action_bar_layer_set_icon(actionBar, BUTTON_ID_DOWN, actionMoon);
}


static void window_unload(Window *window) {
  text_layer_destroy(bottleTextLayer);
  text_layer_destroy(diaperTextLayer);
  text_layer_destroy(moonTextLayer);

  text_layer_destroy(bottleSinceTextLayer);
  text_layer_destroy(diaperSinceTextLayer);
  text_layer_destroy(moonSinceTextLayer);

  #ifdef PBL_COLOR
  layer_destroy(bottleBgLayer);
  layer_destroy(diaperBgLayer);
  layer_destroy(moonBgLayer);
  #endif

  action_bar_layer_destroy(actionBar);

  gbitmap_destroy(actionBottle);
  gbitmap_destroy(actionDiaper);
  gbitmap_destroy(actionMoon);
}


static void init(void) {
  window = window_create();
  window_set_window_handlers(window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload
  });
  window_set_click_config_provider(window, (ClickConfigProvider) config_provider);
  tick_timer_service_subscribe(MINUTE_UNIT, handle_tick);

  // Watch-phone communication
  app_message_register_inbox_received(in_received_handler);
  app_message_register_inbox_dropped(in_dropped_handler);
  app_message_register_outbox_sent(out_sent_handler);
  app_message_register_outbox_failed(out_failed_handler);

  const uint32_t inbound_size = 64;
  const uint32_t outbound_size = 64;
  app_message_open(inbound_size, outbound_size);

  window_stack_push(window, true /* Animated */);
}

static void deinit(void) {
  window_destroy(window);
}

// Entry Point
int main(void) {
  init();
  app_event_loop();
  deinit();
}