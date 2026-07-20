module.exports = {
  apps: [{
    name: 'newsradar',
    script: 'src/index.js',
    cwd: '/home/deploy/verificacion-news',
    cron: '0 * * * *',
    autorestart: false,
    watch: false,
    max_memory_restart: '100M',
    env: {
      NODE_ENV: 'production'
    }
  }, {
    name: 'newsradar-weekly',
    script: 'weekly-summary.js',
    cwd: '/home/deploy/verificacion-news',
    cron: '0 12 * * 0',
    autorestart: false,
    watch: false,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
