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
## Correcciones y mejoras — 2026-07-21

### Problema detectado
Discrepancia entre web y Telegram: la web mostraba 35 temas, el bot solo 8.
Causa:  solo extraía 5 temas elegibles por ciclo,
y el umbral  dejaba fuera 27 temas con 1-2 fuentes.

### Cambios aplicados

#### 1. Umbral de publicación reducido ()
- **Antes**: 
- **Después**: 
- **Motivo**: temas con 2 fuentes ya tienen cobertura mínima verificable
- **Riesgo**: pueden colar temas con cobertura baja pero no ruido (solo 23 de 27
  entraron en catch-up)
- **Backward compat**: no afecta a temas ya publicados, solo permite más
  elegibles hacia adelante

#### 2. Límite por ciclo aumentado ()
- **Antes**: 
- **Después**: 
- **Motivo**: drenar backlog más rápido sin esperar múltiples ciclos
- **Riesgo**: flooding en Telegram; mitigado por rate-limit interno
  (1.5s entre mensajes) y límite de 15

#### 3. Catch-up manual (one-time script)
- Se ejecutó  que publicó 20 temas backlog al canal
- 3 temas quedaron por rate-limit de Telegram; se publicarán en siguiente
  ciclo ordinario
- Script eliminado tras ejecución

### Criterios de seguridad y mantenimiento

#### Evitar filtraciones en GitHub
-  en  confirmado
- Ninguna API key (Telegram, Groq, FactCheck) está hardcodeada en src/
-  fue eliminado tras su uso
- Verificar con:  antes de commit

#### Sincronización segura con GitHub
-  y  excluidos del repo
- No hay secrets en el historial de commits
- Usar [32m[PM2] [39mSpawning PM2 daemon with pm2_home=/home/miguelc/.pm2
[32m[PM2] [39mPM2 Successfully daemonized después de git pull

#### Vida útil y mantenimiento
- PM2 restart automático vía cron en newsradar cada hora
- newsradar-web con auto-restart en PM2
- Logs rotativos con pm2-logrotate (retener 30 días)

#### Interés del usuario
- El bot de Telegram es el canal principal (consumo pasivo)
- La web es soporte gráfico (consulta activa)
- La brecha web>Telegram está ahora controlada: los temas con ≥2 fuentes
  se publican en ambos canales

#### No romper lo conseguido
- Los 11 PM2 procesos existentes no se tocaron
- newsradar-web (frontend) no requirió modificación
- Base de datos SQLite sin cambios de esquema
- Nginx reverse proxy intacto

#### No omitir nada
- Quedan 4 temas en DB con sources_count=1 que no califican ni calificarán
  (ruido/unconfirmed) — no se publican pero sí son visibles en web
- Los 3 temas rate-limited se publicarán en el próximo ciclo automático
- Si en el futuro se quiere publicar también temas con 1 fuente, habrá que
  añadir lógica de calidad adicional (no solo bajar el threshold)

## Correcciones y mejoras - 2026-07-21

### Problema detectado
Discrepancia entre web y Telegram: la web mostraba 35 temas, el bot solo 8.
Causa: getUnpublishedTopics(5) solo extraia 5 temas elegibles por ciclo,
y el umbral sources_count >= 3 dejaba fuera 27 temas con 1-2 fuentes.

### Cambios aplicados

#### 1. Umbral de publicacion reducido (src/db.js:111)
- Antes: sources_count >= 3
- Despues: sources_count >= 2
- Motivo: temas con 2 fuentes ya tienen cobertura minima verificable

#### 2. Limite por ciclo aumentado (src/index.js:128)
- Antes: getUnpublishedTopics(5)
- Despues: getUnpublishedTopics(15)
- Motivo: drenar backlog mas rapido sin esperar multiples ciclos

#### 3. Catch-up manual (one-time script)
- Se ejecuto catchup.cjs que publico 20 temas backlog al canal
- 3 temas quedaron por rate-limit de Telegram; se publicaran en el proximo ciclo

### Criterios de seguridad y mantenimiento

#### Evitar filtraciones en GitHub
- .env en .gitignore confirmado; ninguna API key hardcodeada
- catchup.cjs eliminado tras su uso
- Verificar con git status antes de commit
- No commitear .env, ecosystem.config.cjs ni newsradar.db

#### Sincronizacion segura con GitHub
- ecosystem.config.cjs y .env excluidos del repo
- No hay secrets en el historial de commits
- Usar pm2 restart tras git pull

#### Interes del usuario
- El bot de Telegram es el canal principal (consumo pasivo)
- La web es soporte grafico (consulta activa)
- La brecha web>Telegram controlada: temas con >=2 fuentes se publican en ambos canales

#### No romper lo conseguido
- Los 11 PM2 procesos existentes intactos
- newsradar-web sin modificaciones
- Base de datos SQLite sin cambios de esquema; Nginx intacto

#### No omitir nada
- 4 temas en DB con sources_count=1 no califican (ruido) - visibles en web, no en Telegram
- 3 temas rate-limited se publicaran en el proximo ciclo automatico
- Landing page: anadido NewsRadar Verifica en viajeinteligencia.com (seccion Servicios)

## Promocion y visibilidad — 2026-07-21

### Implementado (Sprint 1 - bajo esfuerzo)

#### RSS Feed de verificaciones
- Endpoint: /api/feed.rss en server.js
- XML RSS 2.0 con atom:self link
- Incluye ultimos 30 topics (7d por defecto)
- Parametro ?days=N para ventana personalizada
- Enlace "RSS Feed" en el header de la pagina web

#### Sitemap actualizado
- Anadida entrada: https://viajeinteligencia.com/verifica/ (daily, priority 0.8)
- Archivo: /var/www/viajeinteligencia-landing/sitemap.xml

#### Cross-promotion (Ecosistema OSINT)
- Barra horizontal en /verifica/ antes del footer
- Enlaces a: Emergencias · GeoRisk · Corrupcion · SIEG Security · Estado
- Mismo diseno que el resto del sitio (texto + separadores)

#### Compartir en RRSS
- Botones: X, WhatsApp, Telegram, Facebook + Web Share API nativa
- En el footer de /verifica/

#### Contador de visitas
- SQLite visits.db con sesiones unicas (localStorage + UUID)
- Tarjeta "Visitas" en los KPIS del dashboard

### Pendiente (Sprint 2 - esfuerzo medio)
- [ ] Widget embed (iframe) para que otros medios incrusten verificaciones
- [ ] OG image dinamica por cada verificacion (tarjeta compartible)
- [ ] Publicacion automatica a X (Twitter) de cada nuevo topic
- [ ] Lista de correo semanal (capturar emails desde landing)

### Pendiente (Sprint 3 - esfuerzo alto)
- [ ] API publica documentada para terceros
- [ ] Badge "Verificado por NewsRadar" (sello PNG descargable)
- [ ] Email outreach a medios/fact-checkers

## Sprint 2 — Promocion y visibilidad (2026-07-21)

### Implementado

#### Widget embed (iframe)
- Endpoint: GET /embed
- Parametros: ?theme=light|dark, ?days=N
- Diseno limpio, responsivo, listo para iframe
- Incluye ultimas 10 verificaciones con verdictos y metadata
- Enlace "Widget" en el header de /verifica/
- Uso: <iframe src="https://viajeinteligencia.com/verifica/embed" width="100%" height="400"></iframe>

#### OG image y SEO
- Sitemap actualizado con /verifica/ (daily, priority 0.8)
- OG preview SVG ya existente y funcional
- Meta tags OG en el HTML

### Decisiones tomadas

#### X/Twitter descartado
- Verificado: desde Feb 2026 X API no tiene free tier para nuevos desarrolladores
- Pricing: $0.015/post sin link, $0.20/post con link, lectura $0.005/lectura
- Solo hay pay-per-use con cap de 2M lecturas/mes, o Enterprise desde $42K/mes
- No se implementa publicacion automatica a X por coste y decision del proyecto

#### Alternativas sin cargo
- Bluesky: API abierta gratuita, mismo patron que el bot Telegram
- Mastodon: API de ActivityPub gratuita, instancias hispanas disponibles
- Nombres sugeridos: @newsradarverifica.bsky.social y @newsradar@masto.es

### Pendiente (Sprint 3)
- [ ] Crear cuenta Bluesky + bot automatico
- [ ] Crear cuenta Mastodon + bot automatico
- [ ] API publica documentada para terceros
- [ ] Badge "Verificado por NewsRadar" (sello PNG descargable)
- [ ] Email outreach a medios/fact-checkers
