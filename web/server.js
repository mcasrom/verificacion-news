import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'newsradar.db');
const VISITS_PATH = path.join(__dirname, '..', 'visits.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
const PORT = process.env.PORT || 3006;

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

let vdb;
function getVisitsDb() {
  if (!vdb) {
    vdb = new Database(VISITS_PATH);
    vdb.pragma('journal_mode = WAL');
    vdb.exec("CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT UNIQUE, first_seen DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP)");
  }
  return vdb;
}

app.use(express.json());

app.get('/api/stats', (req, res) => {
  try {
    const d = getDb();
    const stats = d.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN published_telegram = 1 THEN 1 ELSE 0 END) as published, SUM(CASE WHEN factcheck_verdict = \'false\' THEN 1 ELSE 0 END) as false_count, SUM(CASE WHEN factcheck_verdict = \'true\' THEN 1 ELSE 0 END) as true_count, SUM(CASE WHEN factcheck_verdict = \'misleading\' THEN 1 ELSE 0 END) as misleading_count, SUM(CASE WHEN factcheck_verdict IS NULL THEN 1 ELSE 0 END) as unverified_count, ROUND(AVG(sources_count), 1) as avg_sources FROM topics').get();
    res.json({ ok: true, stats });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/topics', (req, res) => {
  try {
    const d = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const country = req.query.country || '';
    const category = req.query.category || '';
    const days = parseInt(req.query.days) || 7;
    const q = req.query.q || '';

    let where = 'WHERE 1=1';
    if (days > 0) { where += " AND first_seen >= datetime('now', '-" + days + " days')"; }
    const params = [];
    if (country) { where += ' AND country = ?'; params.push(country); }
    if (category) { where += ' AND topic_category = ?'; params.push(category); }
    if (q) { where += ' AND (headline LIKE ? OR summary LIKE ?)'; const sq = '%' + q + '%'; params.push(sq, sq); }

    const total = d.prepare('SELECT COUNT(*) as count FROM topics ' + where).get(...params).count;
    const topics = d.prepare('SELECT id,headline,improved_headline,improved_summary,summary,factcheck_verdict,factcheck_source,factcheck_url,article_link,source_names,sources_count,country,topic_category,trending_score,first_seen,image_url FROM topics ' + where + ' ORDER BY trending_score DESC, first_seen DESC LIMIT ? OFFSET ?').all(...params, limit, offset);

    res.json({ ok: true, topics: topics.map(t => ({
      id: t.id, headline: t.improved_headline || t.headline,
      summary: t.improved_summary || t.summary,
      verdict: t.factcheck_verdict, source: t.factcheck_source,
      url: t.factcheck_url, article: t.article_link,
      sources: t.sources_count, country: t.country,
      category: t.topic_category, score: t.trending_score,
      date: t.first_seen, image: t.image_url
    })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/topics/:id', (req, res) => {
  try {
    const d = getDb();
    const t = d.prepare('SELECT * FROM topics WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, topic: t });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// RSS feed
app.get('/api/feed.rss', (req, res) => {
  try {
    const d = getDb();
    const days = parseInt(req.query.days) || 7;
    const items = d.prepare("SELECT id,headline,improved_headline,summary,improved_summary,factcheck_verdict,factcheck_source,factcheck_url,sources_count,country,first_seen FROM topics WHERE first_seen >= datetime('now', '-" + days + " days') ORDER BY first_seen DESC LIMIT 30").all();
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n<title>NewsRadar Verifica</title>\n<link>https://viajeinteligencia.com/verifica/</link>\n<description>Verificacion automatica de noticias - 13 fuentes RSS + GDELT + Google Fact Check</description>\n<language>es</language>\n<atom:link href="https://viajeinteligencia.com/verifica/api/feed.rss" rel="self" type="application/rss+xml"/>\n';
    for (const item of items) {
      const verdicts = {false:'FALSO', true:'VERIFICADO', misleading:'ENGAÑOSO'};
      const v = item.factcheck_verdict ? ' [' + (verdicts[item.factcheck_verdict] || item.factcheck_verdict) + ']' : '';
      const hl = (item.improved_headline || item.headline || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const summary = (item.improved_summary || item.summary || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const url = 'https://viajeinteligencia.com/verifica/';
      const date = item.first_seen ? new Date(item.first_seen + 'Z').toUTCString() : new Date().toUTCString();
      xml += '<item>\n<title>' + hl + v + '</title>\n<link>' + url + '</link>\n<guid isPermaLink="false">newsradar-' + item.id + '</guid>\n<description>' + (summary || hl) + '</description>\n<pubDate>' + date + '</pubDate>\n<source>' + (item.factcheck_source || 'NewsRadar') + '</source>\n</item>\n';
    }
    xml += '</channel>\n</rss>';
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Visitor counter
app.post('/api/visit', (req, res) => {
  try {
    const v = getVisitsDb();
    const sessionId = req.body.sessionId || randomUUID();
    const existing = v.prepare('SELECT id FROM visits WHERE session_id = ?').get(sessionId);
    if (existing) {
      v.prepare('UPDATE visits SET last_seen = CURRENT_TIMESTAMP WHERE session_id = ?').run(sessionId);
    } else {
      v.prepare('INSERT OR IGNORE INTO visits (session_id) VALUES (?)').run(sessionId);
    }
    const total = v.prepare('SELECT COUNT(DISTINCT session_id) as count FROM visits').get();
    const today = v.prepare("SELECT COUNT(DISTINCT session_id) as count FROM visits WHERE date(last_seen) = date('now')").get();
    res.json({ ok: true, total: total.count, today: today.count });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/visits', (req, res) => {
  try {
    const v = getVisitsDb();
    const total = v.prepare('SELECT COUNT(DISTINCT session_id) as count FROM visits').get();
    const today = v.prepare("SELECT COUNT(DISTINCT session_id) as count FROM visits WHERE date(last_seen) = date('now')").get();
    res.json({ ok: true, total: total.count, today: today.count });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.use(express.static(PUBLIC_DIR));

app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('[Web] http://0.0.0.0:' + PORT + ' | DB: ' + DB_PATH);
});
