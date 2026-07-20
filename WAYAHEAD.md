# WayAhead — NewsRadar Verifica

## Estado Actual (2026-07-20)

### Infrastructure
- **Server**: Hetzner NBG1 (4GB RAM, 38GB SSD), Nürnberg
- **PM2**: 3 procesos newsradar + 11 existentes intactos
- **Cron**: Cada hora (0 * * * *)
- **Web**: viajeinteligencia.com/verifica/ via Nginx + Cloudflare

### Pipeline
```
RSS (13 feeds, ~250 items) ─┐
                              ├── detectTrending → verify → Groq → Telegram
GDELT GKG (~13k records) ────┘
```

### RSS Feeds (13 activos)
BBC World, BBC Mundo, Al Jazeera, France24, DW News, El País, El Mundo, ABC España, Clarín, The Guardian, NPR World, Infodefensa

### Verification
- **Google Fact Check API** — gratis, cobertura limitada
- **Cross-reference histórico** — detecta reincidencias en DB
- **Señales de riesgo mecánicas** — diversidad fuentes, astroturfing, sesgo, cobertura GDELT
- **Groq (Llama 3.1)** — mejora contenido + análisis de coherencia entre fuentes (sin decidir verdad)

### Web Frontend
- Express + SQLite readonly + SPA vanilla
- Stats KPIs + topic list con filtros (país, categoría, días)
- Tabs: Verificaciones / Metodología / Fuentes
- Tema claro/oscuro con persistencia
- Favicon SVG + OG preview para RRSS
- API REST: /api/stats, /api/topics, /api/topics/:id

### Telegram
- **Bot**: @newsradar_verifica_bot
- **Canal**: @newsradarverificabot
- Pin con leyenda de veredictos
- Resumen semanal (domingos 12:00)
- Card generator SVG→PNG para posts sin imagen

### Changelog

#### v1.0.0 — Initial scaffold
- db.js, gdelt.js, rss.js, factcheck.js, verify.js, telegram.js, index.js

#### v1.1.0 — RSS + GDELT working
- RSS: 13 feeds con entity expansion fix
- GDELT: .gkg.csv.zip daily parser (13k+ records)
- DetectRSSTrending: word overlap clustering

#### v1.2.0 — Telegram + FactCheck
- Google Fact Check API integration
- Telegram channel publishing
- Risk signals: astroturfing, source bias, GDELT cross-ref

#### v1.3.0 — Cron + Deploy
- PM2 en Hetzner, cron cada 15min → cada hora
- 11 PM2 procesos existentes intactos

#### v1.4.0 — Groq + Web
- Groq content improvement (no verification)
- Groq coherence analysis
- Cross-reference histórico (reincidencias)
- Web frontend (Express + SPA)
- Nginx reverse proxy
- Card generator SVG→PNG
- Infodefensa (defensa/geopolítica)
- Favicon + OG preview + Meta tags
- Tema claro/oscuro
- Filtro temporal (7d/24h/Todo)
- Pin del canal + resumen semanal
