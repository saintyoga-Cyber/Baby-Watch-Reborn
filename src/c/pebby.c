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

/***** Offset Picker (long-press: log an event in the past) *****/
#define CATEGORY_BOTTLE 1
#define CATEGORY_DIAPER 2
#define CATEGORY_SLEEP 3
#define OFFSET_STEP_MIN 15
#define OFFSET_MAX_MIN 720


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

// Offset picker (long-press: log in the past)
static Window *pickerWindow = NULL;
static TextLayer *pickerTitleLayer;
static TextLayer *pickerOffsetLayer;
static int pendingCategory = CATEGORY_BOTTLE;
static int pendingOffsetMin = 0;
static char pickerTitleText[12];
static char pickerOffsetText[40];


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

    snprintf(text, 14, "%s - %s", sleepStartStr, sleepEndStr);
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

// Timestamp-driven logging helpers, reused by both tap (now) and the
// offset picker (back-dated). The timestamp is supplied by the caller.

static void logBottle(time_t t) {
  bottleStart = t;
  setTimeText(t, timeTextUp, bottleTextLayer);
  setTimeSinceText(bottleStart, timeSinceTextUp, bottleSinceTextLayer);
  persist_write_int(PERSIST_BOTTLE, t);
  sendTimelineEvent(EVENT_BOTTLE, t);
}

static void logDiaper(time_t t) {
  diaperStart = t;
  setTimeText(t, timeTextMiddle, diaperTextLayer);
  setTimeSinceText(diaperStart, timeSinceTextMiddle, diaperSinceTextLayer);
  persist_write_int(PERSIST_DIAPER, t);
  sendTimelineEvent(EVENT_DIAPER, t);
}

static void toggleSleep(time_t t) {
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

void up_single_click_handler(ClickRecognizerRef recognizer, void *context) {
  ButtonId bt = click_recognizer_get_button_id(recognizer);
  time_t t = time(NULL);

  if (bt == BUTTON_ID_SELECT) {
    logDiaper(t);
  } else {
    logBottle(t);
  }
}

void down_single_click_handler(ClickRecognizerRef recognizer, void *context) {
  toggleSleep(time(NULL));
}


/***** Offset Picker Window (long-press to log in the past) *****/

static void updatePickerLabel(void) {
  const char *name = "Bottle";
  if (pendingCategory == CATEGORY_DIAPER) {
    name = "Diaper";
  } else if (pendingCategory == CATEGORY_SLEEP) {
    name = "Sleep";
  }
  snprintf(pickerTitleText, sizeof(pickerTitleText), "%s", name);
  text_layer_set_text(pickerTitleLayer, pickerTitleText);

  if (pendingOffsetMin == 0) {
    snprintf(pickerOffsetText, sizeof(pickerOffsetText), "now");
  } else if (pendingOffsetMin < 60) {
    snprintf(pickerOffsetText, sizeof(pickerOffsetText), "%d min ago", pendingOffsetMin);
  } else {
    int hours = pendingOffsetMin / 60;
    int minutes = pendingOffsetMin % 60;
    if (minutes == 0) {
      snprintf(pickerOffsetText, sizeof(pickerOffsetText), "%d h ago", hours);
    } else {
      snprintf(pickerOffsetText, sizeof(pickerOffsetText), "%d h %d min ago", hours, minutes);
    }
  }
  text_layer_set_text(pickerOffsetLayer, pickerOffsetText);
}

static void picker_up_handler(ClickRecognizerRef recognizer, void *context) {
  pendingOffsetMin += OFFSET_STEP_MIN;
  if (pendingOffsetMin > OFFSET_MAX_MIN) {
    pendingOffsetMin = OFFSET_MAX_MIN;
  }
  updatePickerLabel();
}

static void picker_down_handler(ClickRecognizerRef recognizer, void *context) {
  pendingOffsetMin -= OFFSET_STEP_MIN;
  if (pendingOffsetMin < 0) {
    pendingOffsetMin = 0;
  }
  updatePickerLabel();
}

static void picker_select_handler(ClickRecognizerRef recognizer, void *context) {
  time_t t = time(NULL) - (time_t) pendingOffsetMin * 60;

  switch (pendingCategory) {
    case CATEGORY_DIAPER:
      logDiaper(t);
      break;
    case CATEGORY_SLEEP:
      toggleSleep(t);
      break;
    default:
      logBottle(t);
      break;
  }

  window_stack_pop(true);
}

static void picker_config_provider(void *context) {
  window_single_repeating_click_subscribe(BUTTON_ID_UP, 150, picker_up_handler);
  window_single_repeating_click_subscribe(BUTTON_ID_DOWN, 150, picker_down_handler);
  window_single_click_subscribe(BUTTON_ID_SELECT, picker_select_handler);
}

static void picker_window_load(Window *win) {
  Layer *root = window_get_root_layer(win);
  GRect bounds = layer_get_bounds(root);

  pickerTitleLayer = text_layer_create((GRect){ .origin = {0, bounds.size.h / 2 - 46}, .size = {bounds.size.w, 34} });
  text_layer_set_text_alignment(pickerTitleLayer, GTextAlignmentCenter);
  text_layer_set_font(pickerTitleLayer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  layer_add_child(root, text_layer_get_layer(pickerTitleLayer));

  pickerOffsetLayer = text_layer_create((GRect){ .origin = {0, bounds.size.h / 2 - 6}, .size = {bounds.size.w, 44} });
  text_layer_set_text_alignment(pickerOffsetLayer, GTextAlignmentCenter);
  text_layer_set_font(pickerOffsetLayer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  layer_add_child(root, text_layer_get_layer(pickerOffsetLayer));

  updatePickerLabel();
}

static void picker_window_unload(Window *win) {
  text_layer_destroy(pickerTitleLayer);
  text_layer_destroy(pickerOffsetLayer);
}

static void show_picker(int category) {
  pendingCategory = category;
  pendingOffsetMin = 0;

  if (!pickerWindow) {
    pickerWindow = window_create();
    window_set_window_handlers(pickerWindow, (WindowHandlers) {
      .load = picker_window_load,
      .unload = picker_window_unload
    });
    window_set_click_config_provider(pickerWindow, (ClickConfigProvider) picker_config_provider);
  }

  window_stack_push(pickerWindow, true);
}

void bottle_long_click_handler(ClickRecognizerRef recognizer, void *context) {
  show_picker(CATEGORY_BOTTLE);
}

void diaper_long_click_handler(ClickRecognizerRef recognizer, void *context) {
  show_picker(CATEGORY_DIAPER);
}

void sleep_long_click_handler(ClickRecognizerRef recognizer, void *context) {
  show_picker(CATEGORY_SLEEP);
}


void config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_UP, up_single_click_handler);
  window_single_click_subscribe(BUTTON_ID_SELECT, up_single_click_handler);
  window_single_click_subscribe(BUTTON_ID_DOWN, down_single_click_handler);

  window_long_click_subscribe(BUTTON_ID_UP, 0, bottle_long_click_handler, NULL);
  window_long_click_subscribe(BUTTON_ID_SELECT, 0, diaper_long_click_handler, NULL);
  window_long_click_subscribe(BUTTON_ID_DOWN, 0, sleep_long_click_handler, NULL);
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

  // ----- Layout parameters (rectangular defaults: aplite/basalt/diorite/emery) -----
  // Background bands {origin.y, height} for bottle, diaper, moon rows.
  int bandY[3] = { 0, rowHeight, rowHeight * 2 };
  int bandH[3] = { rowHeight, rowHeight, rowHeight + 6 };
  // Per-row text Y for the time line and the "since" line.
  int timeY[3]  = { bounds.size.h/3/2 - 20, bounds.size.h/2 - 20, 5*bounds.size.h/3/2 - 20 };
  int sinceY[3] = { bounds.size.h/3/2 + 2,  bounds.size.h/2 + 2,  5*bounds.size.h/3/2 + 2 };
  int textX = 0;
  int textW = contentWidth;
  int bandW = contentWidth;
  // Sleep range ("HH:MM - HH:MM") font; shrunk on round so it never truncates.
  const char *moonTimeFont = FONT_KEY_GOTHIC_24_BOLD;
  // Focused middle (diaper) row font; enlarged on round.
  const char *diaperTimeFont = FONT_KEY_GOTHIC_24_BOLD;

#if defined(PBL_ROUND)
  // Centered-focus layout for the 180x180 circular display. Bands span the
  // full width so they tuck under the black action bar's curved edge (no
  // gap). Text is centered in the visible colored area and kept near each
  // band's vertical centre, away from the narrow top/bottom arcs where it
  // would otherwise clip.
  int fullH = bounds.size.h + 6;   // restore the true 180px height

  bandW = bounds.size.w;
  bandY[0] = 0;     bandH[0] = 42;            // smaller top (bottle) band
  bandY[1] = 42;    bandH[1] = 78;            // emphasized middle (diaper) band
  bandY[2] = 120;   bandH[2] = fullH - 120;   // roomy bottom (sleep) band

  timeY[0]  = 6;    sinceY[0]  = 26;
  timeY[1]  = 56;   sinceY[1]  = 88;
  timeY[2]  = 126;  sinceY[2]  = 150;

  moonTimeFont = FONT_KEY_GOTHIC_18_BOLD;       // fits "HH:MM - HH:MM" on the narrow circle
  diaperTimeFont = FONT_KEY_GOTHIC_28_BOLD;     // emphasize the focused middle row
#endif

  // Create colored background layers (only on color devices)
  #ifdef PBL_COLOR
  bottleBgLayer = layer_create((GRect){ .origin = {0, bandY[0]}, .size = {bandW, bandH[0]} });
  layer_set_update_proc(bottleBgLayer, bottle_bg_update_proc);
  layer_add_child(window_layer, bottleBgLayer);

  diaperBgLayer = layer_create((GRect){ .origin = {0, bandY[1]}, .size = {bandW, bandH[1]} });
  layer_set_update_proc(diaperBgLayer, diaper_bg_update_proc);
  layer_add_child(window_layer, diaperBgLayer);

  moonBgLayer = layer_create((GRect){ .origin = {0, bandY[2]}, .size = {bandW, bandH[2]} });
  layer_set_update_proc(moonBgLayer, moon_bg_update_proc);
  layer_add_child(window_layer, moonBgLayer);
  #endif

  // Text layers

  bottleSinceTextLayer = text_layer_create((GRect){ .origin = {textX, sinceY[0] }, .size = {textW, 24} });
  text_layer_set_text_alignment(bottleSinceTextLayer, GTextAlignmentCenter);
  text_layer_set_text(bottleSinceTextLayer, "");
  text_layer_set_font(bottleSinceTextLayer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  #ifdef PBL_COLOR
  text_layer_set_background_color(bottleSinceTextLayer, GColorClear);
  text_layer_set_text_color(bottleSinceTextLayer, GColorBlack);
  #endif
  layer_add_child(window_layer, text_layer_get_layer(bottleSinceTextLayer));

  diaperSinceTextLayer = text_layer_create((GRect){ .origin = {textX, sinceY[1] }, .size = {textW, 24} });
  text_layer_set_font(diaperSinceTextLayer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  text_layer_set_text_alignment(diaperSinceTextLayer, GTextAlignmentCenter);
  text_layer_set_text(diaperSinceTextLayer, "");
  #ifdef PBL_COLOR
  text_layer_set_background_color(diaperSinceTextLayer, GColorClear);
  text_layer_set_text_color(diaperSinceTextLayer, GColorBlack);
  #endif
  layer_add_child(window_layer, text_layer_get_layer(diaperSinceTextLayer));

  moonSinceTextLayer = text_layer_create((GRect){ .origin = {textX, sinceY[2] }, .size = {textW, 24} });
  text_layer_set_font(moonSinceTextLayer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  text_layer_set_text_alignment(moonSinceTextLayer, GTextAlignmentCenter);
  text_layer_set_text(moonSinceTextLayer, "");
  #ifdef PBL_COLOR
  text_layer_set_background_color(moonSinceTextLayer, GColorClear);
  text_layer_set_text_color(moonSinceTextLayer, GColorBlack);
  #endif
  layer_add_child(window_layer, text_layer_get_layer(moonSinceTextLayer));


  bottleTextLayer = text_layer_create((GRect){ .origin = {textX, timeY[0] }, .size = {textW, 24} });
  text_layer_set_text_alignment(bottleTextLayer, GTextAlignmentCenter);
  text_layer_set_text(bottleTextLayer, "");
  text_layer_set_font(bottleTextLayer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  #ifdef PBL_COLOR
  text_layer_set_background_color(bottleTextLayer, GColorClear);
  text_layer_set_text_color(bottleTextLayer, GColorBlack);
  #endif
  layer_add_child(window_layer, text_layer_get_layer(bottleTextLayer));

  diaperTextLayer = text_layer_create((GRect){ .origin = {textX, timeY[1] }, .size = {textW, 30} });
  text_layer_set_font(diaperTextLayer, fonts_get_system_font(diaperTimeFont));
  text_layer_set_text_alignment(diaperTextLayer, GTextAlignmentCenter);
  text_layer_set_text(diaperTextLayer, "");
  #ifdef PBL_COLOR
  text_layer_set_background_color(diaperTextLayer, GColorClear);
  text_layer_set_text_color(diaperTextLayer, GColorBlack);
  #endif
  layer_add_child(window_layer, text_layer_get_layer(diaperTextLayer));

  moonTextLayer = text_layer_create((GRect){ .origin = {textX, timeY[2] }, .size = {textW, 24} });
  text_layer_set_font(moonTextLayer, fonts_get_system_font(moonTimeFont));
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
  if (pickerWindow) {
    window_destroy(pickerWindow);
  }
  window_destroy(window);
}

// Entry Point
int main(void) {
  init();
  app_event_loop();
  deinit();
}