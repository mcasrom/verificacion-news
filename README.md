# NewsRadar - Verificación Automática de Noticias

Sistema automático de detección de tendencias y verificación de noticias. **Sin IA en decisiones de veracidad** - solo cruza datos de fuentes verificables.

## Arquitectura

```
[Cron 15 min]
  → 1. Detectar temas trending (GDELT GKG + RSS)
  → 2. Cruzar con Google Fact Check API
  → 3. Guardar en SQLite (dedup por hash)
  → 4. Publicar en Telegram (canal público)
```

## Setup

```bash
cd ~/verificacion_news
cp .env.example .env
# Editar .env con tus API keys

npm install
npm run migrate
npm run run-now  # Test manual
npm start        # Modo continuo (cron cada 15 min)
```

## API Keys Necesarias (todas gratis)

1. **Google Fact Check API**: https://console.cloud.google.com/apis/credentials
2. **Telegram Bot**: @BotFather → /newbot
3. **GDELT**: No necesita key (acceso público)

## Estructura

```
src/
├── index.js           # Principal + cron loop
├── db.js              # SQLite schema + helpers
├── verify.js          # Lógica de cruce de datos
├── telegram.js        # Publicación a canal
└── sources/
    ├── gdelt.js       # GDELT GKG parser
    ├── rss.js         # RSS feed aggregator
    └── factcheck.js   # Google Fact Check API
```

## Deploy en Hetzner

```bash
# PM2
pm2 start src/index.js --name newsradar
pm2 save

# Nginx (si expone API en futuro)
# server block en /etc/nginx/sites-available/newsradar
```

## Producción

El bot **no dictamina verdad/falso**. Solo reporta:
- ✅ Verificado por [fuente]
- ❌ Desmentido por [fuente]  
- ⚠️ Sin verificar - cobertura inconsistente
- 📊 [N] medios cubren este tema
