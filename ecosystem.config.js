{
  "apps": [
    {
      "name": "smarthive-backend",
      "cwd": "./dist-server",
      "script": "server.cjs",
      "instances": 1,
      "autorestart": true,
      "watch": false,
      "max_memory_restart": "1G",
      "time": true,
      "env": {
        "NODE_ENV": "production",
        "PORT": "3001"
      }
    }
  ]
}
