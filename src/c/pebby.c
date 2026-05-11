#include "pebble.h"
#include <math.h>
#include <string.h>
#include <time.h>


/***** Persist Keys *****/
#define PERSIST_BOTTLE     1
#define PERSIST_DIAPER     2
#define PERSIST_MOON_START 3
#define PERSIST_MOON_END   4
#define PERSIST_NURSING    5

/***** Timeline Event Types *****/
#define EVENT_BOTTLE      1
#define EVENT_DIAPER      2
#define EVENT_SLEEP_START 3
#define EVENT_SLEEP_END   4
#define EVENT_NURSING     5


/***** Variables *****/

static Window *window;

static SimpleMenuLayer *s_menu_layer;
static SimpleMenuSection s_menu_sections[1];
static SimpleMenuItem s_menu_items[4];

static char s_sub_bottle[32];
static char s_sub_nursing[32];
static char s_sub_diaper[32];
static char s_sub_sleep[32];

static int sleeping = 0;
static time_t bottleStart  = 0;
static time_t nursingStart = 0;
static time_t diaperStart  = 0;
static time_t sleepStart   = 0;
static time_t sleepEnd     = 0;


/***** Subtitle Helpers *****/

static void build_time_subtitle(time_t ts, char *buf, size_t sz) {
  if (ts == 0) {
    buf[0] = '\0';
    return;
  }
  char timeStr[8];
  struct tm *t = localtime(&ts);
  strftime(timeStr, sizeof(timeStr), clock_is_24h_style() ? "%H:%M" : "%I:%M", t);

  time_t elapsed = time(NULL) - ts;
  if (elapsed < 60) {
    snprintf(buf, sz, "%s (just now)", timeStr);
  } else if (elapsed < 3600) {
    snprintf(buf, sz, "%s (%dm ago)", timeStr, (int)(elapsed / 60));
  } else {
    snprintf(buf, sz, "%s (%dh ago)", timeStr, (int)(elapsed / 3600));
  }
}

static void build_sleep_subtitle(char *buf, size_t sz) {
  if (sleepStart == 0) {
    buf[0] = '\0';
    return;
  }
  char startStr[8], endStr[8];
  struct tm *t = localtime(&sleepStart);
  strftime(startStr, sizeof(startStr), clock_is_24h_style() ? "%H:%M" : "%I:%M", t);

  if (sleepEnd != 0) {
    t = localtime(&sleepEnd);
    strftime(endStr, sizeof(endStr), clock_is_24h_style() ? "%H:%M" : "%I:%M", t);
    snprintf(buf, sz, "%s - %s", startStr, endStr);
  } else {
    snprintf(buf, sz, "%s - ...", startStr);
  }
}

static void refresh_menu(void) {
  layer_mark_dirty(simple_menu_layer_get_layer(s_menu_layer));
}


/***** Phone Communication *****/

void sendTimelineEvent(int eventType, time_t timestamp) {
  DictionaryIterator *iter;
  app_message_outbox_begin(&iter);
  dict_write_int32(iter, MESSAGE_KEY_EVENT_TYPE, eventType);
  dict_write_int32(iter, MESSAGE_KEY_EVENT_TIME, (int32_t)timestamp);
  app_message_outbox_send();
}


/***** Menu Callback *****/

static void menu_select_callback(int index, void *ctx) {
  time_t t = time(NULL);
  switch (index) {
    case 0:
      bottleStart = t;
      persist_write_int(PERSIST_BOTTLE, t);
      sendTimelineEvent(EVENT_BOTTLE, t);
      build_time_subtitle(bottleStart, s_sub_bottle, sizeof(s_sub_bottle));
      break;
    case 1:
      nursingStart = t;
      persist_write_int(PERSIST_NURSING, t);
      sendTimelineEvent(EVENT_NURSING, t);
      build_time_subtitle(nursingStart, s_sub_nursing, sizeof(s_sub_nursing));
      break;
    case 2:
      diaperStart = t;
      persist_write_int(PERSIST_DIAPER, t);
      sendTimelineEvent(EVENT_DIAPER, t);
      build_time_subtitle(diaperStart, s_sub_diaper, sizeof(s_sub_diaper));
      break;
    case 3:
      if (!sleeping) {
        sleeping = 1;
        sleepStart = t;
        sleepEnd = 0;
        persist_write_int(PERSIST_MOON_START, t);
        persist_write_int(PERSIST_MOON_END, 0);
        sendTimelineEvent(EVENT_SLEEP_START, t);
        s_menu_items[3].title = "End Sleep";
      } else {
        sleeping = 0;
        sleepEnd = t;
        persist_write_int(PERSIST_MOON_END, t);
        sendTimelineEvent(EVENT_SLEEP_END, t);
        s_menu_items[3].title = "Start Sleep";
      }
      build_sleep_subtitle(s_sub_sleep, sizeof(s_sub_sleep));
      break;
  }
  refresh_menu();
}


/***** Tick Handler *****/

void handle_tick(struct tm *tick_time, TimeUnits units_changed) {
  build_time_subtitle(bottleStart,  s_sub_bottle,  sizeof(s_sub_bottle));
  build_time_subtitle(nursingStart, s_sub_nursing, sizeof(s_sub_nursing));
  build_time_subtitle(diaperStart,  s_sub_diaper,  sizeof(s_sub_diaper));
  build_sleep_subtitle(s_sub_sleep, sizeof(s_sub_sleep));
  refresh_menu();
}


/***** Message Handlers *****/

void out_sent_handler(DictionaryIterator *sent, void *context) {
  app_log(APP_LOG_LEVEL_DEBUG, "pebby.c", 0, "Out message delivered");
}

void out_failed_handler(DictionaryIterator *failed, AppMessageResult reason, void *context) {
  if (reason != APP_MSG_SEND_TIMEOUT) return;
  DictionaryIterator *iter;
  app_message_outbox_begin(&iter);
  uint32_t sizes[] = {64, 64};
  dict_merge(iter, sizes, failed, 0, NULL, NULL);
  app_message_outbox_send();
}

void in_received_handler(DictionaryIterator *received, void *context) {
  Tuple *text_tuple = dict_find(received, 0);
  if (text_tuple && strcmp(text_tuple->value->cstring, "reset") == 0) {
    bottleStart  = 0;
    nursingStart = 0;
    diaperStart  = 0;
    sleepStart   = 0;
    sleepEnd     = 0;
    sleeping     = 0;

    persist_write_int(PERSIST_BOTTLE,     0);
    persist_write_int(PERSIST_NURSING,    0);
    persist_write_int(PERSIST_DIAPER,     0);
    persist_write_int(PERSIST_MOON_START, 0);
    persist_write_int(PERSIST_MOON_END,   0);

    s_sub_bottle[0]  = '\0';
    s_sub_nursing[0] = '\0';
    s_sub_diaper[0]  = '\0';
    s_sub_sleep[0]   = '\0';

    s_menu_items[3].title = "Start Sleep";
    refresh_menu();
  }
}

void in_dropped_handler(AppMessageResult reason, void *context) {
  app_log(APP_LOG_LEVEL_DEBUG, "pebby.c", 0, "In message dropped");
}


/***** App *****/

static void window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  // Restore persisted state
  if (persist_exists(PERSIST_BOTTLE)) {
    bottleStart = persist_read_int(PERSIST_BOTTLE);
    build_time_subtitle(bottleStart, s_sub_bottle, sizeof(s_sub_bottle));
  }
  if (persist_exists(PERSIST_NURSING)) {
    nursingStart = persist_read_int(PERSIST_NURSING);
    build_time_subtitle(nursingStart, s_sub_nursing, sizeof(s_sub_nursing));
  }
  if (persist_exists(PERSIST_DIAPER)) {
    diaperStart = persist_read_int(PERSIST_DIAPER);
    build_time_subtitle(diaperStart, s_sub_diaper, sizeof(s_sub_diaper));
  }
  if (persist_exists(PERSIST_MOON_START)) {
    sleepStart = persist_read_int(PERSIST_MOON_START);
    sleepEnd   = persist_exists(PERSIST_MOON_END) ? persist_read_int(PERSIST_MOON_END) : 0;
    sleeping   = (sleepEnd == 0 && sleepStart != 0) ? 1 : 0;
    build_sleep_subtitle(s_sub_sleep, sizeof(s_sub_sleep));
  }

  // Build menu items
  s_menu_items[0] = (SimpleMenuItem){
    .title    = "Bottle Feed",
    .subtitle = s_sub_bottle,
    .callback = menu_select_callback
  };
  s_menu_items[1] = (SimpleMenuItem){
    .title    = "Breastfeed",
    .subtitle = s_sub_nursing,
    .callback = menu_select_callback
  };
  s_menu_items[2] = (SimpleMenuItem){
    .title    = "Diaper Change",
    .subtitle = s_sub_diaper,
    .callback = menu_select_callback
  };
  s_menu_items[3] = (SimpleMenuItem){
    .title    = sleeping ? "End Sleep" : "Start Sleep",
    .subtitle = s_sub_sleep,
    .callback = menu_select_callback
  };

  s_menu_sections[0] = (SimpleMenuSection){
    .items     = s_menu_items,
    .num_items = 4
  };

  s_menu_layer = simple_menu_layer_create(bounds, window, s_menu_sections, 1, NULL);
  layer_add_child(window_layer, simple_menu_layer_get_layer(s_menu_layer));
}

static void window_unload(Window *window) {
  simple_menu_layer_destroy(s_menu_layer);
}

static void init(void) {
  window = window_create();
  window_set_window_handlers(window, (WindowHandlers){
    .load   = window_load,
    .unload = window_unload
  });

  tick_timer_service_subscribe(MINUTE_UNIT, handle_tick);

  app_message_register_inbox_received(in_received_handler);
  app_message_register_inbox_dropped(in_dropped_handler);
  app_message_register_outbox_sent(out_sent_handler);
  app_message_register_outbox_failed(out_failed_handler);
  app_message_open(64, 64);

  window_stack_push(window, true);
}

static void deinit(void) {
  window_destroy(window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
