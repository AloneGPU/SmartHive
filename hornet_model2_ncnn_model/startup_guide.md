# SmartHive 树莓派端文档

更新时间：2026-04-05  
适用版本：树莓派三进程架构（`sensor_process.py` / `vision_process.py` / `transfer_process.py`）与后端 `server.ts` + `config.py`  
新增硬件：加湿器模块(GPIO25) + OLED显示屏(I2C:SDA/SCL) + 舵机云台(GPIO18) + ESP8266联调验证通过

***

## 新增功能亮点

- **舵机云台**：实现固定左右平视扫描（10°→170°→10°循环），扩大摄像头监测范围
- **模块化设计**：新增 `diagnostics_helper.py` 和 `mqtt_support.py` 公共模块
- **安全配置**：`env.example` 环境变量管理敏感信息
- **可靠性提升**：MQTT 连接增加自动重连机制
- **调试友好**：日志节流和数据格式化工具

&#x20;

## 目录

- [项目概览](https://claude.ai/chat/cd031abd-2d5c-41dd-a8ad-4265bb3283a3#%E9%A1%B9%E7%9B%AE%E6%A6%82%E8%A7%88)
- [文件结构](https://claude.ai/chat/cd031abd-2d5c-41dd-a8ad-4265bb3283a3#%E6%96%87%E4%BB%B6%E7%BB%93%E6%9E%84)
- [系统架构](https://claude.ai/chat/cd031abd-2d5c-41dd-a8ad-4265bb3283a3#%E7%B3%BB%E7%BB%9F%E6%9E%B6%E6%9E%84)
- [进程说明](https://claude.ai/chat/cd031abd-2d5c-41dd-a8ad-4265bb3283a3#%E8%BF%9B%E7%A8%8B%E8%AF%B4%E6%98%8E)
- [配置文件参考](https://claude.ai/chat/cd031abd-2d5c-41dd-a8ad-4265bb3283a3#%E9%85%8D%E7%BD%AE%E6%96%87%E4%BB%B6%E5%8F%82%E8%80%83)
- [硬件接线](https://claude.ai/chat/cd031abd-2d5c-41dd-a8ad-4265bb3283a3#%E7%A1%AC%E4%BB%B6%E6%8E%A5%E7%BA%BF)
- [部署与启动](https://claude.ai/chat/cd031abd-2d5c-41dd-a8ad-4265bb3283a3#%E9%83%A8%E7%BD%B2%E4%B8%8E%E5%90%AF%E5%8A%A8)
- [日常运维](https://claude.ai/chat/cd031abd-2d5c-41dd-a8ad-4265bb3283a3#%E6%97%A5%E5%B8%B8%E8%BF%90%E7%BB%B4)
- [数据流说明](https://claude.ai/chat/cd031abd-2d5c-41dd-a8ad-4265bb3283a3#%E6%95%B0%E6%8D%AE%E6%B5%81%E8%AF%B4%E6%98%8E)

***

## 项目概览

树莓派端由三个独立 Python 进程组成，通过 MQTT 松耦合通信，任意一个进程崩溃或重启不影响其余进程继续工作。

**完整硬件体系（9个设备）**:

| 进程 | 文件 | 核心职责 |
|------|------|---------|
| 数据采集 | `sensor_process.py` | 读传感器、蜜蜂计数、每小时归档、🆕加湿器控制、🆕OLED显示驱动 |
| 视觉识别 | `vision_process.py` | 摄像头采集、胡蜂推理、舵机控制、🆕胡蜂检测触发信号 |
| 数据传输 | `transfer_process.py` | 合并两路数据、上报后端、转发指令 |

***

## 文件结构

```
hive/
├── config.py               # 全局配置 dataclass 定义（三进程共享，🆕含加湿器+OLED配置）
├── config.yaml             # 配置文件（唯一需要修改的文件）
├── sensor_process.py       # 数据采集进程（🆕含加湿器控制+OLED显示驱动）
├── vision_process.py       # 视觉识别进程（🆕含舵机控制）
├── transfer_process.py     # 数据传输进程
├── diagnostics_helper.py   # 🆕 诊断工具：日志节流 + 数据格式化
├── mqtt_support.py         # 🆕 MQTT公共逻辑：客户端创建 + 重连机制
├── launch.sh               # 一键启动脚本（调试用）
├── model.ncnn.param        # NCNN 模型参数文件
├── model.ncnn.bin          # NCNN 模型权重文件
├── oled_test.py            # 🆕 OLED显示屏测试脚本
├── env.example             # 🆕 环境变量示例（敏感信息配置模板）
├── runtime/                # 自动创建，存放 MQTT 离线缓存
└── logs/                   # 自动创建，存放日志文件

```

***

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        树莓派                                │
│                                                             │
│  ┌──────────────────┐        ┌──────────────────────────┐  │
│  │  sensor_process  │        │     vision_process        │  │
│  │                  │        │                           │  │
│  │  DHT22 内部温湿度 │        │  摄像头采集               │  │
│  │  DHT22 外部温湿度 │        │  NCNN/YOLO 推理           │  │
│  │  HX711 体重       │        │  胡蜂计数 (HornetCounter) │  │
│  │  GPS 定位         │        │  舵机水平扫描              │  │
│  │  红外蜜蜂计数     │        │  帧标注 + 本地预览         │  │
│  │  🆕 加湿器控制    │◄───────│  🆕 胡蜂检测触发信号      │  │
│  │  (GPIO25)        │        │                           │  │
│  │  🆕 OLED显示驱动  │        │                           │  │
│  │  (I2C:SDA/SCL)   │        │                           │  │
│  └────────┬─────────┘        └───────────┬──────────────┘  │
│           │  MQTT: smarthive/pi5/sensors  │  MQTT: pi5/vision/result
│           └──────────────┬───────────────┘                 │
│                          │                                  │
│                  ┌───────▼──────────┐                      │
│                  │ transfer_process │                       │
│                  │                  │                       │
│                  │  合并两路数据     │                       │
│                  │  UDS 指令转发     │                       │
│                  └───────┬──────────┘                      │
│                          │ HTTP POST                        │
├──────────────────────────┼──────────────────────────────────┤
│           执行层（输出设备）                                 │
│  ┌──────────────────┐  ┌──────────────────────────┐        │
│  │   加湿器模块      │  │   OLED显示屏              │        │
│  │   (继电器5V输出)  │  │   (SSD1306, I2C)          │        │
│  │   GPIO25控制     │  │   实时温湿度显示          │        │
│  └──────────────────┘  └──────────────────────────┘        │
└──────────────────────────┼──────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │       后端服务器         │
              │  /api/iot/ingest        │ ← 实时数据
              │  /api/beehive          │ ← 每小时归档
              │  /api/vision/frame     │ ← 视觉帧
              └─────────────────────────┘
```

***

## 进程说明

### sensor\_process.py — 数据采集进程

**入口：** `python3 sensor_process.py --config config.yaml`

#### 类结构

类

职责

`SharedSensorState`

线程安全的传感器共享状态，`get_snapshot()` 供其他模块读取

`SensorReader`

硬件读取线程：DHT22 / HX711 / GPS / 红外计数器

`MqttTelemetryPublisher`

实时遥测推送，每 `publish_interval_seconds` 秒发一次；支持 `zlib+base64` 压缩

`HourlyArchiver`

每小时对齐整点，将均值/累计值 POST 到 `/api/beehive`

`SensorProcess`

主编排器，统一 start / stop

#### SensorReader 硬件支持

**DHT22 温湿度**

- 每 `dht_read_interval`（默认 5s）读一次
- 依赖：`adafruit_dht`、`board`

**HX711 体重秤**

- 每 `hx711_read_interval`（默认 0.5s）读一次
- 内部取 5 次均值 + 中值滤波窗口平滑
- 读完后 `power_down` 省电，下次读前 `power_up`
- 依赖：`hx711-rpi-py`

**GPS**

- 非阻塞读取串口，有数据时解析 `$GPGGA` 报文
- 依赖：`pyserial`、`pynmea2`

**红外对射蜜蜂计数器**

- GPIO 边沿中断模式，不轮询
- 外侧先触发 → `in_count +1`（蜜蜂进入蜂箱）
- 内侧先触发 → `out_count +1`（蜜蜂离开蜂箱）
- 两传感器触发间隔超过 `ir_direction_window_ms` 的单次触发丢弃
- 依赖：`RPi.GPIO`

#### MQTT 遥测包字段

```
{
  "deviceId": "pi5-vision-client",
  "timestamp": 1700000000000,
  "sensors": [
    {"type": "temperature",      "value": 26.5,  "unit": "C"},
    {"type": "humidity",         "value": 63.2,  "unit": "%"},
    {"type": "weight",           "value": 2150.0,"unit": "g"},
    {"type": "bee_in",           "value": 142,   "unit": "count"},
    {"type": "bee_out",          "value": 138,   "unit": "count"},
    {"type": "gps_lat",          "value": 24.842,"unit": "deg"},
    {"type": "gps_lon",          "value": 103.305,"unit": "deg"},
    {"type": "hornet_count",     "value": 0,     "unit": "count"},
    {"type": "hornet_individual","value": 3,     "unit": "count"},
    {"type": "hornet_activity",  "value": 5,     "unit": "count"},
    {"type": "fps",              "value": 14.8,  "unit": "fps"},
    {"type": "latency",          "value": 67.2,  "unit": "ms"}
  ]
}

```

#### HourlyArchiver 归档字段

对应数据库 `hive_data` 表，每小时计算一次窗口均值/峰值：

字段

计算方式

`temperature` / `humidity`

小时内所有采样的均值

`insideTemperature` / `insideHumidity`

同上（预留箱内传感器）

`outsideTemperature` / `outsideHumidity`

同上

`weight`

小时内所有采样的均值

`beesIn` / `beesOut`

小时内计数器的峰值（单调递增，取 max）

`hornetsDetected`

小时内出现胡蜂的帧数累计

`latitude` / `longitude`

最后一次有效 GPS 读数

***

### vision_process.py — 视觉识别进程

**入口：** `python3 vision_process.py --config config.yaml`

#### 核心优化 [BUG-4 FIX]
- **UDS 指令响应**：进程现在监听 `/tmp/vision_engine.sock`，支持 `transfer_process` 转发的远程模型切换指令。
- **MQTT 实时反馈**：视觉结果不再仅供本地预览，会实时发布到 `pi5/vision/result` 主题，包含 `hornet_count`、`fps` 和 `latency_ms`。
- **高性能采集**：采用多线程架构，分离“采集-推理-标注-上传”管线，在 Pi 5 上可达 15+ FPS。

#### 推理管线（四个线程）

```
frame-producer  → 摄像头读帧 → frame_queue
infer-consumer  → 推理 + 时序过滤 → annotate_queue + result_queue
annotate        → 画框标注 → latest_annotated（供预览和上传）
watchdog        → 监控 last_processed_ts，超时自动重启摄像头和模型

```

#### HornetCounter 三个指标

字段

含义

触发时机

`current_in_frame`

当前帧内检测到的胡蜂框数

每帧更新

`individual_count`

累计独立个体数

track hits 首次达到阈值时 +1

`activity_count`

累计活动次数

已确认 track 超龄消失时 +1

> `individual_count`：同一只胡蜂在画面里待多久都只算一次。\
> `activity_count`：同一只胡蜂每次进出画面算一次，记录接触蜂箱行为次数。

#### 标注帧叠加信息

```
左上角第一行：FPS:14.8  Lat:67.2ms
左上角第二行：Hornets now:1  total:3  events:5
检测框：      Vespa_velutina ID:2 0.87

```

#### 本地预览

浏览器访问 `http://<树莓派IP>:5001`，可看到实时标注画面和 JSON 指标。

***

### transfer\_process.py — 数据传输进程

**入口：** `python3 transfer_process.py --config config.yaml`

#### 类结构

类

职责

`MergedState`

合并 sensor 和 vision 两路 MQTT 数据的状态容器

`MqttBridge`

订阅三个 MQTT topic，更新 MergedState

`IotIngestUploader`

定期将合并数据 POST 到 `/api/iot/ingest`

`UdsCommandRelay`

通过 Unix Socket 将模型切换指令转发给 vision\_process

`ErrorReporter`

将错误发布到 MQTT error\_topic

`TransferProcess`

主编排器

#### 订阅的 MQTT Topic

Topic

来源

用途

`smarthive/pi5/sensors`

sensor\_process

传感器遥测

`pi5/vision/result`

vision\_process

推理结果

`pi5/vision/command`

外部 / 后端

模型切换指令

#### 模型切换指令格式

通过 MQTT 发送到 `pi5/vision/command`：

```
{"param_path": "./model_v2.ncnn.param", "bin_path": "./model_v2.ncnn.bin"}

```

transfer\_process 收到后通过 Unix Socket 转发给 vision\_process，无需重启进程。

***

## 配置文件参考

所有配置集中在 `config.yaml`，修改后重启对应服务生效。

### camera

参数

默认值

说明

`source`

`0`

摄像头编号，USB 摄像头通常为 0

`width` / `height`

`640 / 480`

采集分辨率

`fps`

`30`

目标帧率

`exposure`

`-1`

-1 = 自动曝光

`backend`

`opencv`

`opencv` | `picamera2` | `v4l2` | `gstreamer`

### model

参数

默认值

说明

`param_path` / `bin_path`

`./model.ncnn.*`

模型文件路径

`input_size`

`[320, 320]`

模型输入分辨率

`confidence_threshold`

`0.45`

置信度阈值，越低越灵敏

`nms_threshold`

`0.45`

NMS 阈值

`threads`

`4`

推理线程数

`use_vulkan`

`false`

Pi5 无独立 GPU 建议关闭

### mqtt

参数

默认值

说明

`enabled`

`true`

是否启用 MQTT

`host`

`127.0.0.1`

Broker 地址

`port`

`1883`

Broker 端口

`publish_interval_seconds`

`2.0`

遥测推送间隔（秒）。**需要约每 3 秒刷新一次前端实时看板时，请设为 `3.0`**（与 `sensor_process.py` → `MqttTelemetryPublisher` 一致）

`compress_payload`

`true`

zlib 压缩，减少流量

#### 示例：3 秒实时遥测推送

在 `config.yaml` 的 `mqtt` 段中设置：

```yaml
mqtt:
  enabled: true
  host: "127.0.0.1"
  port: 1883
  data_topic: "smarthive/pi5/sensors"
  client_id: "pi5-vision-client"
  publish_interval_seconds: 3.0
  publish_qos: 1
  compress_payload: true
```

说明：

- 该间隔只影响 **`sensor_process.py` 往本地 Broker 发布的实时遥测**，用于前端 SSE 实时展示。
- **每小时断网缓存 + 补传**由同目录下的 `telemetry_sync` 控制，与 `publish_interval_seconds` 无关；两者可同时启用。

### server\_upload

参数

默认值

说明

`enabled`

`true`

是否上传视觉帧

`url`

`…/api/vision/frame`

后端接口地址

`token`

`""`

**必填**，与后端 `API_TOKEN` 一致

`interval_seconds`

`0.5`

上传间隔，0.5 = 每秒 2 帧

`jpeg_quality`

`80`

JPEG 质量 30\~100

### telemetry\_sync（断网缓存 + MQTT 补传，按小时聚合）

> 这是你提出的“每小时聚合一次（每天 24 次），断网存本地，联网后通过 MQTT 上传，成功后清缓存”的机制。  
> 数据会发布到 `smarthive/+/sensors` 兼容的 payload（后端 `services/mqttIngestService.ts` 可直接解析入库/推送）。

参数

默认值

说明

`enabled`

`true`

是否启用“每小时采集 + 本地缓存 + 补传”链路

`interval_seconds`

`3600`

采集间隔（秒）。保持 3600 即为每天 24 次

`align_to_hour`

`true`

是否对齐整点触发（建议保持 true，便于按小时对齐分析）

`local_db_path`

`./runtime/telemetry_hourly_cache.db`

本地 SQLite 缓存路径（断网时写入此处，进程崩溃/重启可恢复）

`max_pending_records`

`168`

最多保留多少条未补传记录（默认 7 天）。超出会自动删除最旧记录

`max_db_bytes`

`67108864`

本地缓存数据库大小上限（best-effort）。超出会主动删除部分最旧记录并尝试 `VACUUM`

`prune_keep_days`

`30`

按时间清理阈值（天），避免极端情况下长期堆积

`cloud_enabled`

`false`

是否启用“云端 MQTT 补传”。若为 false，会继续采集并落盘，但不会上传

`cloud_broker_url`

`mqtt://127.0.0.1:1883`

云端 MQTT Broker 地址（应与后端 `MQTT_BROKER_URL` 指向同一个 Broker）

`cloud_username` / `cloud_password`

`""`

云端 MQTT 登录信息（如 Broker 开启鉴权）

`cloud_topic`

`""`

发布 topic。留空则使用 `mqtt.data_topic`（默认 `smarthive/pi5/sensors`）

`publish_qos`

`1`

建议保持 QoS1：收到 PUBACK 视为“上传成功”，随后删除本地缓存

补充说明（与后端一致）：

- 小时补传数据会携带 `status.replay=true` 标记，后端会**入库**但会**跳过实时广播**，避免补传历史数据刷屏前端。
- `status.replay=true` 的补传数据也会**跳过设备在线状态更新**（不影响 `lastSeenAt`），避免历史时间戳覆盖“当前在线状态”。

`publish_timeout_seconds`

`6.0`

等待 PUBACK 的超时时间

`batch_sync_size`

`50`

每轮最多补传多少条缓存记录

`min_flush_interval_seconds`

`1.0`

离线/失败时的最小等待时间，避免 busy loop 占用 CPU

### archive

> **注意**：本项目已升级为 MQTT 断网续传架构 (`telemetry_sync`)，此处的旧版 HTTP 归档已默认关闭，以免数据重复上传。

参数

默认值

说明

`enabled`

`false`

是否每小时通过 HTTP 归档（建议保持 false）

`beehive_url`

`…/api/beehive`

后端接口地址

`api_token`

`""`

**必填**，与后端 `API_TOKEN` 一致

`interval_seconds`

`3600`

归档间隔（秒）

`align_to_hour`

`true`

对齐整点触发

`max_retries`

`3`

失败重试次数

### sensor

参数

默认值

说明

`hx711_dout_pin`

`5`

HX711 DOUT GPIO BCM 编号

`hx711_sck_pin`

`6`

HX711 SCK GPIO BCM 编号

`hx711_reference_unit`

`1.0`

**需校准**，运行校准脚本后填入

`hx711_filter_window`

`5`

中值滤波窗口，越大越平滑

`dht_gpio_pin`

`4`

DHT22 数据线 GPIO BCM 编号

`gps_port`

`/dev/serial0`

GPS 串口设备路径

`ir_outer_pin`

`23`

外侧红外传感器 GPIO BCM 编号

`ir_inner_pin`

`24`

内侧红外传感器 GPIO BCM 编号

`ir_active_low`

`true`

NPN 型 → `true`；PNP 型 → `false`

`ir_debounce_ms`

`30`

消抖时间（毫秒）

`ir_direction_window_ms`

`500`

进出方向判断时间窗口（毫秒）

### 🆕 humidifier（加湿器模块配置，胡蜂驱赶）

参数

默认值

说明

`enabled`

`true`

是否启用加湿器自动触发功能

`gpio_pin`

`25`

继电器信号线 GPIO BCM 编号

`active_low`

`true`

低电平触发（true）或高电平触发（false）

`trigger_duration_ms`

`30000`

触发持续时间（毫秒），默认30秒后自动关闭

**工作流程**: vision_process检测到胡蜂 → MQTT发送结果 → sensor_process接收 → GPIO25拉低(30秒) → 继电器吸合 → 加湿器启动5V输出 → 30秒后GPIO25恢复高电平 → 继电器断开 → 加湿器停止

**安全机制**:
- 定时关闭：防止持续运行导致蜂箱过湿（>85%）
- 冷却期：建议5分钟冷却期避免频繁触发
- 日志记录：每次触发记录时间、持续时间、原因

### 🆕 oled（OLED显示屏配置，实时温湿度显示）

参数

默认值

说明

`enabled`

`true`

是否启用OLED显示屏

`i2c_address`

`0x3C`

I2C设备地址（通常为0x3C或0x3D）

`width`

`128`

屏幕宽度（像素）

`height`

`64`

屏幕高度（像素）

`refresh_interval`

`1.0`

刷新间隔（秒），1Hz平衡性能与功耗

**依赖安装**:
```bash
# 启用树莓派I2C接口
sudo raspi-config → Interface Options → I2C → Enable

# 安装Python库
pip install adafruit-circuitpython-ssd1306 pillow

# 检测I2C设备（重启后执行）
sudo i2cdetect -y 1
# 应该看到 0x3c 或 0x3d 地址
```

**显示内容**: 内部温湿度 + 外部温湿度 + 重量 + 胡蜂数量 + 系统状态

### servo

参数

默认值

说明

`enabled`

`true`

是否启用舵机

`gpio_pin`

`18`

信号线 GPIO BCM 编号

`angle_min` / `angle_max`

`10 / 170`

扫描角度范围（度）

`scan_speed_dps`

`25`

扫描速度（度/秒）

`lock_lost_seconds`

`2.0`

目标消失后恢复扫描的等待时间

`track_deadzone_px`

`40`

目标偏离中心多少像素才驱动舵机

`track_gain`

`0.05`

对准增益，过大会抖动

***

## 硬件接线

### GPIO 引脚总览（BCM 编号）

引脚

连接硬件

说明

GPIO 4

DHT22 数据线（内部）

蜂箱内部温湿度传感器

GPIO 17

DHT22 数据线（外部）

蜂箱外部温湿度传感器

GPIO 5

HX711 DOUT

体重秤数据

GPIO 6

HX711 SCK

体重秤时钟

GPIO 18

舵机信号线

PWM 50Hz（必需）

GPIO 23

红外外侧传感器 OUT

蜜蜂计数（外）

GPIO 24

红外内侧传感器 OUT

蜜蜂计数（内）

**GPIO 25**

**加湿器继电器 IN**

**🆕 胡蜂检测触发5V输出（低电平）**

I2C SDA (GPIO2)

OLED 数据线

🆕 SSD1306显示屏

I2C SCL (GPIO3)

OLED 时钟线

🆕 SSD1306显示屏

/dev/serial0

GPS 模块（4针脚：VCC/GND/TX/RX）

9600 波特率

**GPS模块4针脚接线**:
```
GPS模块                  树莓派
┌─────────────┐         ┌──────────┐
│ VCC (5V)    │────────▶│ 5V       │  ← 供电
│ GND         │────────▶│ GND      │  ← 地线
│ TX          │────────▶│ GPIO15   │  ← GPS发送→树莓派接收(RXD)
│ RX          │────────▶│ GPIO14   │  ← 树莓派发送(TXD)→GPS接收
└─────────────┘         └──────────┘
```
**注意**: GPS模块的TX接树莓派的RX(GPIO15)，GPS的RX接树莓派的TX(GPIO14)（交叉连接）。

### GPS 串口配置步骤（重要）
由于树莓派默认将主串口（`/dev/serial0`）用于系统终端登录，我们需要释放它才能让 GPS 模块正常使用：
1. 在树莓派终端输入命令：`sudo raspi-config`
2. 使用键盘上下键选择 `3 Interface Options`，按回车进入。
3. 选择 `I6 Serial Port`，按回车。
4. 此时会问你：*Would you like a login shell to be accessible over serial?*（是否允许通过串口登录终端？）
   - **务必选择 `<No>`**。
5. 接着问：*Would you like the serial port hardware to be enabled?*（是否启用硬件串口？）
   - **务必选择 `<Yes>`**。
6. 界面提示 *The serial login shell is disabled / The serial interface is enabled*，按回车确认。
7. 使用左右键选中 `<Finish>` 退出配置界面。
8. 提示是否重启（*Would you like to reboot now?*），选择 `<Yes>` 重启树莓派。
重启后，GPS 才能通过 `/dev/serial0` 正常传输数据。

### 电源注意事项

- **舵机 VCC** 接独立 5V 电源，不要接树莓派 5V 引脚（启动峰值电流可达 500mA，会拉低主板电压）
- **HX711 VCC** 接 3.3V（大多数模块支持，查规格书确认）
- 红外传感器 / DHT22 / GPS 均可接树莓派 3.3V 或 5V（按模块规格）
- **🆕 加湿器继电器 VCC** 建议接独立5V电源（加湿器功耗较大），继电器IN信号接GPIO25
- **🆕 OLED显示屏 VCC** 接树莓派3.3V（低功耗设备，<100mA）

### 红外传感器安装方向

```
蜂箱外部  ──[外侧传感器 GPIO23]──[入口通道]──[内侧传感器 GPIO24]──  蜂箱内部

蜜蜂进入：外侧先触发 → 内侧后触发 → in_count +1
蜜蜂离开：内侧先触发 → 外侧后触发 → out_count +1

```

### 🆕 加湿器模块接线（胡蜂驱赶）

**硬件规格**: 3引脚继电器模块（低电平触发）  
**功能**: 检测到胡蜂时自动启动5V输出，增加蜂箱湿度驱赶胡蜂  
**触发逻辑**: vision_process检测到胡蜂 → 发送信号 → sensor_process拉低GPIO25 → 继电器吸合 → 加湿器启动(30秒)

```
加湿器继电器模块          树莓派
┌─────────────┐         ┌──────────┐
│   VCC (5V)  │────────▶│ 独立5V电源│  ← 建议独立供电
│   GND       │────────▶│ GND      │
│   IN        │────────▶│ GPIO25   │  ← 低电平触发
└─────────────┘         └──────────┘

继电器输出端：
┌─────────────┐         ┌──────────┐
│ COM (公共端) │────────▶│ 加湿器+  │
│ NO (常开)    │────────▶│ 电源输入 │
└─────────────┘         └──────────┘
```

### 🆕 OLED显示屏接线（实时温湿度显示）

**硬件规格**: SSD1306驱动芯片，0.96寸，128×64像素，I2C接口(4针)  
**功能**: 实时显示蜂箱内外温湿度数据，刷新频率1Hz  

```
OLED显示屏 (SSD1306, 0.96寸)    树莓派
┌─────────────┐              ┌──────────┐
│ VCC (3.3V)  │─────────────▶│ 3.3V     │
│ GND         │─────────────▶│ GND      │
│ SDA (数据)  │─────────────▶│ GPIO2    │  ← I2C数据线
│ SCL (时钟)  │─────────────▶│ GPIO3    │  ← I2C时钟线
└─────────────┘              └──────────┘
```

**显示内容设计**:
```
┌────────────────────────────┐
│  SmartHive Monitor        │
│  ───────────────────────── │
│  IN: 35.2°C / 65.5%      │  ← 内部温湿度
│  OUT:28.5°C / 75.0%      │  ← 外部温湿度
│  ───────────────────────── │
│  Weight:45.8kg           │
│  Hornets:2               │
│  Status:ONLINE           │
└────────────────────────────┘
```

***

## 部署与启动

### 前置依赖安装

```
# MQTT Broker
sudo apt install mosquitto mosquitto-clients
sudo systemctl enable mosquitto
sudo systemctl start mosquitto

# pigpio（舵机 GPIO 控制）
sudo apt install pigpio python3-pigpio
sudo systemctl enable pigpiod
sudo systemctl start pigpiod

# Python 依赖（在 conda yolo_pi5 环境内）
conda activate yolo_pi5
pip install paho-mqtt flask waitress hx711-rpi-py RPi.GPIO \
            pyserial pynmea2 adafruit-circuitpython-dht pyyaml \
            adafruit-circuitpython-ssd1306 pillow pigpio  # 🆕 OLED显示屏和舵机依赖

```

### HX711 校准（首次部署必做）

```
conda activate yolo_pi5
python3 - <<'EOF'
from hx711 import HX711
hx = HX711(dout_pin=5, pd_sck_pin=6)
hx.set_reading_format("MSB", "MSB")
hx.set_reference_unit(1)
hx.reset(); hx.tare()
print("空载读数:", hx.get_weight(20))
known_g = float(input("放上已知砝码，输入克数："))
ref = hx.get_weight(20) / known_g
print(f"填入 config.yaml: hx711_reference_unit: {ref:.4f}")
EOF

```

将输出的系数填入 `config.yaml` 的 `sensor.hx711_reference_unit`。

### 一键安装 systemd 服务

```
cd /home/pi/hive
sudo bash install_services.sh

```

脚本自动完成：检查依赖 → 写入 service 文件 → 创建日志目录 → 注册开机自启 → 按顺序启动三个服务。

### 手动调试启动

```
conda activate yolo_pi5
cd /home/pi/hive

# 三个终端分别运行（或用 tmux 分屏）
python3 sensor_process.py  --config config.yaml
python3 vision_process.py  --config config.yaml   # 等 sensor 启动后再开
python3 transfer_process.py --config config.yaml  # 等 vision 模型加载后再开

```

***

## 日常运维

### 查看服务状态

```
sudo systemctl status hive-sensor hive-vision hive-transfer

```

### 查看实时日志

```
sudo journalctl -u hive-sensor   -f
sudo journalctl -u hive-vision   -f
sudo journalctl -u hive-transfer -f

```

### 重启单个进程

```
sudo systemctl restart hive-vision   # 只重启视觉（不影响传感器和传输）
sudo systemctl restart hive-sensor
sudo systemctl restart hive-transfer

```

### 验证数据流

```
# 确认传感器在发数据
mosquitto_sub -t "smarthive/pi5/sensors" -v

# 确认视觉结果在发数据
mosquitto_sub -t "pi5/vision/result" -v

# 确认错误告警（平时应无输出）
mosquitto_sub -t "pi5/vision/error" -v

```

### 热切换推理模型（无需重启）

```
mosquitto_pub -h 127.0.0.1 -t "pi5/vision/command" \
  -m '{"param_path":"./model_v2.ncnn.param","bin_path":"./model_v2.ncnn.bin"}'

```

### 远程控制舵机

```
# 立即转到 45 度
mosquitto_pub -h 127.0.0.1 -t "pi5/servo/command" -m '{"cmd":"goto","angle":45}'

# 修改扫描速度（度/秒）
mosquitto_pub -h 127.0.0.1 -t "pi5/servo/command" -m '{"cmd":"speed","dps":15}'

# 修改扫描范围
mosquitto_pub -h 127.0.0.1 -t "pi5/servo/command" -m '{"cmd":"range","min":30,"max":150}'

```

### 本地预览画面

浏览器访问 `http://<树莓派IP>:5001`

### 🆕 验证新硬件设备

```bash
# 1. 测试加湿器模块（手动触发GPIO25，3秒后恢复）
python3 -c "
import RPi.GPIO as GPIO
import time
GPIO.setmode(GPIO.BCM)
GPIO.setup(25, GPIO.OUT)
print('[测试] 加湿器启动...')
GPIO.output(25, GPIO.LOW)  # 低电平触发
time.sleep(3)
GPIO.output(25, GPIO.HIGH)
print('[测试] 加湿器已关闭')
GPIO.cleanup()
"

# 2. 检测OLED显示屏I2C地址
sudo i2cdetect -y 1
# 应该看到:
#      0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f
# 00:          -- -- -- -- -- -- -- -- -- -- -- -- 0c --
# ...

# 3. 运行OLED测试脚本（需要编写 oled_test.py）
python3 oled_test.py

# 4. 查看加湿器触发日志
sudo journalctl -u hive-sensor | grep -i "humidifier"

# 5. 查看OLED显示状态日志
sudo journalctl -u hive-sensor | grep -i "oled"
```

***

## 数据流说明

### 实时数据（前端实时窗口）

```
传感器硬件
  → SensorReader（每 0.05s 轮询）
  → SharedSensorState
  → MqttTelemetryPublisher（每 2s 打包发布）
  → MQTT: smarthive/pi5/sensors
  → transfer_process MergedState
  → IotIngestUploader（每 2s POST）
  → 后端 /api/iot/ingest
  → WebSocket 实时推送
  → 前端实时窗口

```

### 视觉帧（前端视频流）

```
摄像头
  → frame-producer（实时采集）
  → infer-consumer（推理 + 过滤）
  → annotate 线程（标注）
  → ServerFrameUploader（每 0.5s 上传）
  → 后端 /api/vision/frame
  → 前端视频显示

```

### 每小时归档（历史图表）

```
传感器采集全程累积
  → HourlyArchiver.tick()（每 0.1s 调用）
  → 整点触发 _flush()
  → 计算小时均值 / 峰值
  → POST /api/beehive
  → 云端 MySQL hive_data 表
  → 前端历史图表

```

### 胡蜂计数数据流

```
摄像头帧
  → InferenceEngine（识别 Vespa_velutina / Vespa_crabro / Vespula_sp）
  → TemporalFilter.update()
    ├─ on_confirmed 回调 → HornetCounter.individual_count +1（新个体）
    └─ on_lost 回调     → HornetCounter.activity_count +1（离开画面）
  → HornetCounter.update_frame()（当前帧框数）
  → VisionResultPublisher → MQTT: pi5/vision/result
  → transfer_process MergedState
  → /api/iot/ingest（实时）
  → /api/beehive hornetsDetected（每小时归档）
```

### 🆕 加湿器触发数据流

```
vision_process 检测到胡蜂
  → HornetCounter 检测到确认目标
  → VisionResultPublisher 发送 MQTT: pi5/vision/result (含 hornet_count > 0)
  → sensor_process 接收 vision 结果
  → 判断 hornet_count > 0 且距离上次触发 > 冷却期(5分钟)
  → GPIO25 输出低电平（30秒）
  → 继电器模块吸合
  → 加湿器启动（5V输出）
  → 30秒后 GPIO25 恢复高电平
  → 继电器断开，加湿器停止
```

### 🆕 OLED显示数据流

```
DHT22 内部传感器读取
  → SharedSensorState 更新 in_temp, in_humi
DHT22 外部传感器读取
  → SharedSensorState 更新 out_temp, out_humi
HX711 称重读取
  → SharedSensorState 更新 weight
  → OLEDDisplayService 读取 SharedSensorState.get_snapshot()
  → 格式化显示数据（每1秒刷新一次）
  → I2C 总线传输 → SSD1306 驱动 → 屏幕渲染
```
