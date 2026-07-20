module.exports = {
  apps: [{
    name: 'newsradar',
    script: 'src/index.js',
    cwd: '/home/miguelc/verificacion_news',
    cron: '*/15 * * * *',
    autorestart: false,
    watch: false,
    max_memory_restart: '100M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
