# WayAhead - Evolution Log

## Sprint 0 - Project Setup (2026-07-20)

### Created
- Project structure: `~/verificacion_news`
- SQLite schema with dedup by hash
- GDELT GKG integration (trending detection)
- RSS aggregator (12 feeds: Reuters, AP, BBC, CNN, Al Jazeera, DW, France24, El País, El Mundo, BBC Mundo, RT, Fox)
- Google Fact Check API integration
- Telegram publisher (canal público)
- No IA in truth decisions - only data from verified sources

### Architecture Decisions
- **No LLM for verification** - LLMs hallucinate; fact-checking must be 100% traceable to real sources
- **Risk signals, not verdicts** - Bot reports status (verified/false/unverified), never "dictates truth"
- **Hash dedup** - SHA256 of normalized headline to avoid duplicates

### Pending
- [ ] Get Fact Check API key from Google Cloud Console
- [ ] Create Telegram bot via @BotFather
- [x] Test with real data - **RSS funciona, GDELT pendiente**
- [ ] Deploy to Hetzner with PM2
- [ ] Cron activation after testing

### What Works (2026-07-20)
- RSS fetch: BBC World + BBC Mundo + Al Jazeera responden (60 items)
- Trending detection: agrupa por keywords, detecta temas repetidos
- SQLite storage: dedup por hash, temas guardados en primer ciclo
- FactCheck API: funciona, verificó 6 temas en primer ciclo
- Telegram publisher: **FUNCIONANDO** - 5 mensajes publicados en canal
- Canal: @NewsRadarVerifica activo con bot administrador
- **Cron: PM2 activo, cada 15 minutos**

### Known Issues
- RSS feeds: solo 3 de 12 funcionan (timeout los demás)
- GDELT: formato de archivos diarios (`.gkg.csv.zip`), no horarios como coded
- Trending: keywords sueltas ("Killed", "What") en vez de temas agrupados
- Sin FactCheck API key = sin verificación real
- Sin Telegram bot = sin publicación

---

## Future Sprints

### Sprint 1 - Deploy & Test
- Deploy to Hetzner
- Configure Nginx
- Test full cycle with real feeds
- Set up PM2

### Sprint 2 - Premium Bot
- Telegram bot premium (suscripción)
- Filter by country/topic
- Historical queries

### Sprint 3 - API/B2B
- REST API for programmatic access
- Metered billing (Stripe)

---

## Changelog

### 2026-07-20
- **v1.0.0** - Initial scaffold created
  - db.js: SQLite with topics table
  - sources/gdelt.js: GDELT GKG parser
  - sources/rss.js: RSS aggregator
  - sources/factcheck.js: Google Fact Check API
  - verify.js: trending detection + risk assessment
  - telegram.js: channel publisher
  - index.js: main orchestrator + cron loop

- **v1.1.0** - First working cycle
  - Fixed RSS: all HTTPS, 20s timeout, redirect follow
  - Fixed GDELT: HTTP (SSL cert mismatch with CDN)
  - Added `detectRSSTrending()`: keyword frequency analysis
  - Added `--test` flag for offline dev with testdata.js
  - 9 trending topics stored in SQLite from real BBC data

- **v1.2.0** - Telegram integration working
  - FactCheck API: fixed languageCode (en), 6 topics verified
  - Telegram bot: @newsradar_verifica_bot
  - Channel: @NewsRadarVerifica
  - 5 messages published to Telegram in first cycle

- **v1.3.0** - Cron activated
  - PM2 with cron: */15 * * * *
  - Automatic cycles every 15 minutes
  - Running on laptop
