import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// 从环境变量读取数据库配置
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smarthive',
  port: parseInt(process.env.DB_PORT || '3306')
};

async function insertTestData() {
  let connection;
  try {
    console.log('正在连接数据库...');
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('数据库连接成功！\n');

    // 检查表是否存在，如果不存在则创建
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS hive_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        temperature FLOAT NOT NULL,
        humidity FLOAT NOT NULL,
        weight FLOAT NOT NULL,
        beesIn INT NOT NULL,
        beesOut INT NOT NULL,
        hornetsDetected INT NOT NULL,
        latitude FLOAT,
        longitude FLOAT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('数据表已就绪\n');

    // 生成测试数据（过去24小时的数据，每小时一条）
    const now = Date.now();
    const testData = [];
    
    for (let i = 23; i >= 0; i--) {
      const timestamp = now - (i * 60 * 60 * 1000); // 每小时一条
      const hour = new Date(timestamp).getHours();
      
      // 模拟一天的温度和湿度变化
      const baseTemp = 25 + Math.sin((hour - 6) * Math.PI / 12) * 8; // 6点最低，14点最高
      const baseHumidity = 50 + Math.cos((hour - 6) * Math.PI / 12) * 15; // 与温度相反
      
      testData.push({
        timestamp: timestamp,
        temperature: parseFloat((baseTemp + (Math.random() - 0.5) * 2).toFixed(1)),
        humidity: parseFloat((baseHumidity + (Math.random() - 0.5) * 5).toFixed(1)),
        weight: parseFloat((20 + i * 0.3 + (Math.random() - 0.5) * 0.5).toFixed(1)), // 逐渐增加
        beesIn: Math.floor(80 + Math.random() * 40),
        beesOut: Math.floor(70 + Math.random() * 50),
        hornetsDetected: Math.random() > 0.9 ? Math.floor(Math.random() * 3) : 0, // 10%概率检测到胡蜂
        latitude: 30.5728 + (Math.random() - 0.5) * 0.001,
        longitude: 104.0668 + (Math.random() - 0.5) * 0.001
      });
    }

    // 清空现有数据（可选，注释掉可以保留旧数据）
    // await connection.execute('TRUNCATE TABLE hive_data');
    // console.log('已清空现有数据\n');

    // 插入测试数据
    console.log('正在插入测试数据...');
    let inserted = 0;
    for (const data of testData) {
      try {
        await connection.execute(
          'INSERT INTO hive_data (timestamp, temperature, humidity, weight, beesIn, beesOut, hornetsDetected, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [data.timestamp, data.temperature, data.humidity, data.weight, data.beesIn, data.beesOut, data.hornetsDetected, data.latitude, data.longitude]
        );
        inserted++;
        const time = new Date(data.timestamp).toLocaleString('zh-CN');
        console.log(`✓ 插入数据 #${inserted}: ${time} - 温度:${data.temperature}°C, 湿度:${data.humidity}%, 重量:${data.weight}kg`);
      } catch (err) {
        console.error(`✗ 插入数据失败:`, err.message);
      }
    }

    console.log(`\n✅ 成功插入 ${inserted} 条测试数据！`);
    console.log('现在您可以在前端页面查看这些数据了。\n');

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('提示: 数据库用户名或密码错误，请检查 .env 文件中的配置');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('提示: 无法连接到数据库，请确保 MySQL 服务正在运行');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('提示: 数据库不存在，请先运行项目让系统自动创建数据库');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

insertTestData();

