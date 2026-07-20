import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'newsradar.db');
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

app.use(express.static(PUBLIC_DIR));

app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('[Web] http://0.0.0.0:' + PORT + ' | DB: ' + DB_PATH);
});
