const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

// 数据库连接配置
const dbConfig = {
  host: 'Localhost',
  user: 'root',
  password: '2006520Zlt',
  database: 'ceshi',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 固定经纬度
const LATITUDE = 25.23448900;
const LONGITUDE = 103.00859700;

// 数据范围配置
const DATA_RANGES = {
  temperature: { min: 15, max: 35 }, // 温度范围：15-35°C
  humidity: { min: 40, max: 80 },     // 湿度范围：40-80%
  weight: { min: 900, max: 2400 },    // 重量范围：900-2400g
  beesIn: { min: 0, max: 10 },        // 蜜蜂进入：0-10
  beesOut: { min: 0, max: 10 },       // 蜜蜂离开：0-10
  hornetsDetected: { min: 0, max: 2 } // 马蜂检测：0-2
};

// 生成随机数据
function generateRandomData(type) {
  const range = DATA_RANGES[type];
  if (!range) return 0;
  
  // 生成随机值
  let value = Math.random() * (range.max - range.min) + range.min;
  
  // 根据数据类型进行处理
  switch (type) {
    case 'temperature':
    case 'humidity':
      return parseFloat(value.toFixed(1)); // 保留一位小数
    case 'weight':
      return parseFloat(value.toFixed(1)); // 保留一位小数
    case 'beesIn':
    case 'beesOut':
    case 'hornetsDetected':
      return Math.floor(value); // 整数
    default:
      return value;
  }
}

// 生成日期范围内的所有日期
function generateDateRange(startDate, endDate) {
  const dates = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dates;
}

// 生成每小时的数据
function generateHourlyData(date) {
  const hourlyData = [];
  
  for (let hour = 0; hour < 24; hour++) {
    const timestamp = new Date(date);
    timestamp.setHours(hour, 0, 0, 0);
    
    const data = {
      timestamp: timestamp.getTime(), // 毫秒级时间戳
      temperature: generateRandomData('temperature'),
      humidity: generateRandomData('humidity'),
      weight: generateRandomData('weight'),
      beesIn: generateRandomData('beesIn'),
      beesOut: generateRandomData('beesOut'),
      hornetsDetected: generateRandomData('hornetsDetected'),
      latitude: LATITUDE,
      longitude: LONGITUDE,
      created_at: timestamp.toISOString().slice(0, 19).replace('T', ' ')
    };
    
    hourlyData.push(data);
  }
  
  return hourlyData;
}

// 批量插入数据到hive_data表
async function insertHiveData(connection, data) {
  if (data.length === 0) return;
  
  const values = data.map(item => [
    item.timestamp,
    item.temperature,
    item.humidity,
    item.weight,
    item.beesIn,
    item.beesOut,
    item.hornetsDetected,
    item.latitude,
    item.longitude,
    item.created_at
  ]);
  
  const sql = `
    INSERT INTO hive_data (timestamp, temperature, humidity, weight, beesIn, beesOut, hornetsDetected, latitude, longitude, created_at)
    VALUES ?
  `;
  
  try {
    const [result] = await connection.promise().query(sql, [values]);
    console.log(`成功插入 ${result.affectedRows} 条数据到hive_data表`);
    return result.affectedRows;
  } catch (error) {
    console.error('插入hive_data表失败:', error);
    throw error;
  }
}

// 批量插入数据到iot_telemetry表
async function insertIotTelemetryData(connection, data) {
  if (data.length === 0) return;
  
  const deviceId = 'pi5-vision-client';
  const telemetryData = [];
  
  // 为每条hive_data生成多个iot_telemetry记录
  data.forEach(item => {
    const sensorTypes = [
      { type: 'temperature', value: item.temperature, unit: 'C' },
      { type: 'humidity', value: item.humidity, unit: '%' },
      { type: 'weight', value: item.weight, unit: 'g' },
      { type: 'bees_in', value: item.beesIn, unit: 'count' },
      { type: 'bees_out', value: item.beesOut, unit: 'count' },
      { type: 'hornet_count', value: item.hornetsDetected, unit: 'count' }
    ];
    
    sensorTypes.forEach(sensor => {
      telemetryData.push([
        item.timestamp,
        deviceId,
        sensor.type,
        sensor.value,
        sensor.unit,
        1, // qos
        JSON.stringify({ location: { lat: LATITUDE, lon: LONGITUDE } }) // meta_json
      ]);
    });
  });
  
  const sql = `
    INSERT INTO iot_telemetry (timestamp, device_id, sensor_type, value, unit, qos, meta_json)
    VALUES ?
  `;
  
  try {
    const [result] = await connection.promise().query(sql, [telemetryData]);
    console.log(`成功插入 ${result.affectedRows} 条数据到iot_telemetry表`);
    return result.affectedRows;
  } catch (error) {
    console.error('插入iot_telemetry表失败:', error);
    throw error;
  }
}

// 生成数据样本文件
function generateDataSample(data) {
  const sampleData = data.slice(0, 24); // 取一天的数据作为样本
  const samplePath = path.join(__dirname, 'data_sample.json');
  
  fs.writeFileSync(samplePath, JSON.stringify(sampleData, null, 2));
  console.log(`数据样本已生成到 ${samplePath}`);
}

// 主函数
async function main() {
  console.log('开始生成数据...');
  
  // 计算日期范围
  const startDate = new Date('2026-02-01');
  const endDate = new Date(); // 当前日期
  
  console.log(`日期范围: ${startDate.toISOString().split('T')[0]} 到 ${endDate.toISOString().split('T')[0]}`);
  
  // 生成日期列表
  const dates = generateDateRange(startDate, endDate);
  console.log(`总天数: ${dates.length}`);
  console.log(`预计生成数据量: ${dates.length * 24} 条`);
  
  // 生成所有数据
  let allData = [];
  dates.forEach(date => {
    const hourlyData = generateHourlyData(date);
    allData = [...allData, ...hourlyData];
  });
  
  console.log(`实际生成数据量: ${allData.length} 条`);
  
  // 生成数据样本
  generateDataSample(allData);
  
  // 连接数据库
  const connection = mysql.createPool(dbConfig);
  
  try {
    console.log('连接数据库...');
    
    // 批量插入数据
    const batchSize = 100;
    let totalInserted = 0;
    
    for (let i = 0; i < allData.length; i += batchSize) {
      const batch = allData.slice(i, i + batchSize);
      
      console.log(`插入批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(allData.length / batchSize)}`);
      
      // 插入hive_data
      const hiveInserted = await insertHiveData(connection, batch);
      totalInserted += hiveInserted;
      
      // 插入iot_telemetry
      await insertIotTelemetryData(connection, batch);
    }
    
    console.log(`\n数据生成与导入完成！`);
    console.log(`总插入数据量: ${totalInserted} 条`);
    console.log(`数据范围: ${startDate.toISOString().split('T')[0]} 到 ${endDate.toISOString().split('T')[0]}`);
    console.log(`数据密度: 每天24条记录（每小时一条）`);
    console.log(`经纬度: ${LATITUDE}, ${LONGITUDE}`);
    
  } catch (error) {
    console.error('执行失败:', error);
  } finally {
    // 关闭数据库连接
    connection.end();
    console.log('数据库连接已关闭');
  }
}

// 检查是否存在必要的表
async function checkTables() {
  const connection = mysql.createPool(dbConfig);
  
  try {
    console.log('检查数据库表结构...');
    
    // 检查hive_data表
    const [hiveDataResult] = await connection.promise().query(
      "SHOW TABLES LIKE 'hive_data'"
    );
    
    if (hiveDataResult.length === 0) {
      console.error('错误: hive_data表不存在');
      console.error('请先创建必要的数据库表结构');
      process.exit(1);
    }
    
    // 检查iot_telemetry表
    const [iotTelemetryResult] = await connection.promise().query(
      "SHOW TABLES LIKE 'iot_telemetry'"
    );
    
    if (iotTelemetryResult.length === 0) {
      console.error('错误: iot_telemetry表不存在');
      console.error('请先创建必要的数据库表结构');
      process.exit(1);
    }
    
    console.log('数据库表结构检查通过');
    
  } catch (error) {
    console.error('检查数据库表结构失败:', error);
    process.exit(1);
  } finally {
    connection.end();
  }
}

// 执行检查和主函数
checkTables().then(main);
