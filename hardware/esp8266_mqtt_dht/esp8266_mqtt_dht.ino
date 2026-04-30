/**
 * ESP8266 + DHT11/DHT22 -> MQTT -> 后端 smarthive 项目入库
 *
 * 依赖库（Arduino IDE 库管理器安装）：
 * - PubSubClient by Nick O'Leary
 * - DHT sensor library by Adafruit + Adafruit Unified Sensor
 *
 * 接线（DHT22 为例）：
 * - VCC -> 3.3V
 * - GND -> GND
 * - DATA -> D4 (GPIO2，可按需改 DHTPIN）
 *
 * 使用前修改下面 WIFI_* / MQTT_* / DHT 类型
 */

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// ============ 必改配置 ============
const char* WIFI_SSID     = "你的WiFi名称";
const char* WIFI_PASSWORD = "你的WiFi密码";

// EMQX 或任意 MQTT Broker（与后端 MQTT_BROKER_URL 一致）
const char* MQTT_HOST     = "192.168.1.100";  // 服务器 IP 或域名
const uint16_t MQTT_PORT  = 1883;
const char* MQTT_USER     = "smarthive_iot";   // EMQX 里创建的用户，无则填空串
const char* MQTT_PASS     = "你的MQTT密码";

// 与后端一致：smarthive/<deviceId>/sensors
const char* DEVICE_ID     = "esp8266-test";

// NTP 用于毫秒时间戳（与后端一致）
const char* NTP_SERVER    = "pool.ntp.org";
const long  GMT_OFFSET_SEC = 8 * 3600;  // 中国东八区
const int   DAYLIGHT_OFFSET_SEC = 0;

#define DHTPIN 2
#define DHTTYPE DHT22

DHT dht(DHTPIN, DHTTYPE);

WiFiClient espClient;
PubSubClient mqtt(espClient);

char topicBuf[80];
char jsonBuf[512];

static unsigned long lastPublish = 0;
const unsigned long PUBLISH_INTERVAL_MS = 10000;

void setup_wifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi OK, IP: ");
  Serial.println(WiFi.localIP());
}

void setup_ntp() {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  Serial.print("NTP sync");
  for (int i = 0; i < 30; i++) {
    time_t now = time(nullptr);
    if (now > 1700000000) {
      Serial.println(" OK");
      return;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.println(" timeout (will still send, timestamp may be wrong)");
}

uint64_t now_ms() {
  time_t sec = time(nullptr);
  if (sec < 1700000000) {
    return (uint64_t)millis();
  }
  return (uint64_t)sec * 1000ULL;
}

void reconnect_mqtt() {
  while (!mqtt.connected()) {
    Serial.print("MQTT connect...");
    String clientId = String("esp8266-") + String(ESP.getChipId(), HEX);
    bool ok;
    if (strlen(MQTT_USER) > 0) {
      ok = mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    } else {
      ok = mqtt.connect(clientId.c_str());
    }
    if (ok) {
      Serial.println(" OK");
      return;
    }
    Serial.print(" fail ");
    Serial.println(mqtt.state());
    delay(3000);
  }
}

void publish_telemetry(float temp, float humi) {
  snprintf(topicBuf, sizeof(topicBuf), "smarthive/%s/sensors", DEVICE_ID);

  uint64_t ts = now_ms();
  int rssi = WiFi.RSSI();

  String ipStr = WiFi.localIP().toString();

  int n = snprintf(
    jsonBuf, sizeof(jsonBuf),
    "{"
    "\"deviceId\":\"%s\","
    "\"timestamp\":%llu,"
    "\"sensors\":["
    "{\"type\":\"in_temp\",\"value\":%.2f,\"unit\":\"C\"},"
    "{\"type\":\"in_humi\",\"value\":%.2f,\"unit\":\"%%\"}"
    "],"
    "\"status\":{"
    "\"online\":true,"
    "\"rssi\":%d,"
    "\"ip\":\"%s\""
    "}"
    "}",
    DEVICE_ID,
    (unsigned long long)ts,
    temp,
    humi,
    rssi,
    ipStr.c_str()
  );

  if (n <= 0 || (size_t)n >= sizeof(jsonBuf)) {
    Serial.println("JSON buffer overflow");
    return;
  }

  Serial.print("Publish ");
  Serial.println(topicBuf);
  Serial.println(jsonBuf);

  if (mqtt.publish(topicBuf, jsonBuf, true)) {
    Serial.println("MQTT publish OK");
  } else {
    Serial.println("MQTT publish FAIL");
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  dht.begin();

  setup_wifi();
  setup_ntp();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    setup_wifi();
  }

  if (!mqtt.connected()) {
    reconnect_mqtt();
  }
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastPublish < PUBLISH_INTERVAL_MS) {
    return;
  }
  lastPublish = now;

  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || isnan(t)) {
    Serial.println("DHT read failed, using dummy values for link test");
    t = 25.0f;
    h = 60.0f;
  }

  publish_telemetry(t, h);
}
