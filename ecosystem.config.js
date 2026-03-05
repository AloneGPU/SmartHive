// PM2 进程管理配置文件
// 用于云服务器部署时管理后端服务

module.exports = {
  apps: [{
    name: 'smarthive-backend',
    script: '/www/wwwroot/smarthive/dist-server/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: '/www/wwwroot/smarthive/logs/err.log',
    out_file: '/www/wwwroot/smarthive/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};

