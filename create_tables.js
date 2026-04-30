const mysql = require('mysql2');
const fs = require('fs');

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

// 读取SQL文件
const sqlContent = fs.readFileSync('./create_tables.sql', 'utf8');

// 连接数据库
const connection = mysql.createPool(dbConfig);

async function createTables() {
  console.log('开始创建数据库表结构...');
  
  try {
    // 分割SQL语句
    const sqlStatements = sqlContent
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    // 逐条执行SQL语句
    for (const statement of sqlStatements) {
      await connection.promise().query(statement);
    }
    
    console.log('数据库表结构创建成功！');
    console.log('创建的表：');
    console.log('1. hive_data - 存储蜂箱数据');
    console.log('2. iot_telemetry - 存储物联网遥测数据');
    
  } catch (error) {
    console.error('创建数据库表结构失败:', error);
  } finally {
    // 关闭数据库连接
    connection.end();
    console.log('数据库连接已关闭');
  }
}

// 执行创建表操作
createTables();
