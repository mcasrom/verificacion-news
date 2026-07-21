import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'newsradar.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT UNIQUE NOT NULL,
      headline TEXT NOT NULL,
      summary TEXT,
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      sources_count INTEGER DEFAULT 1,
      source_names TEXT,
      factcheck_verdict TEXT,
      factcheck_source TEXT,
      factcheck_url TEXT,
      risk_signal TEXT,
      country TEXT DEFAULT 'global',
      topic_category TEXT,
      trending_score REAL DEFAULT 0,
      published_telegram BOOLEAN DEFAULT 0,
      article_link TEXT,
      image_url TEXT,
      improved_headline TEXT,
      improved_summary TEXT,
      suggested_emoji TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_topics_hash ON topics(hash);
    CREATE INDEX IF NOT EXISTS idx_topics_first_seen ON topics(first_seen);
    CREATE INDEX IF NOT EXISTS idx_topics_trending ON topics(trending_score DESC);
    CREATE INDEX IF NOT EXISTS idx_topics_published ON topics(published_telegram);
  `);

  // Backward compat: add columns if missing (sqlite ignores IF NOT EXISTS for ALTER)
  try { db.exec('ALTER TABLE topics ADD COLUMN improved_headline TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE topics ADD COLUMN improved_summary TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE topics ADD COLUMN suggested_emoji TEXT DEFAULT \'\''); } catch (e) {}
}

export function insertTopic(topic) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO topics 
    (hash, headline, summary, sources_count, source_names, factcheck_verdict,
     factcheck_source, factcheck_url, risk_signal, country, topic_category,
     trending_score, article_link, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    topic.hash,
    topic.headline,
    topic.summary || null,
    topic.sourcesCount || 1,
    topic.sourceNames || '',
    topic.factcheckVerdict || null,
    topic.factcheckSource || null,
    topic.factcheckUrl || null,
    topic.riskSignal || null,
    topic.country || 'global',
    topic.topicCategory || null,
    topic.trendingScore || 0,
    topic.articleLink || null,
    topic.imageUrl || null
  );
}

export function updateTopicSources(hash, newCount, srcNames) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE topics
    SET sources_count = ?, source_names = ?, last_seen = CURRENT_TIMESTAMP, trending_score = ? * 1.5
    WHERE hash = ?
  `);
  return stmt.run(newCount, srcNames, newCount, hash);
}

export function updateTopicImprovements(id, improvedHeadline, improvedSummary, suggestedEmoji) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE topics
    SET improved_headline = ?, improved_summary = ?, suggested_emoji = ?
    WHERE id = ?
  `);
  return stmt.run(improvedHeadline, improvedSummary, suggestedEmoji || '', id);
}

export function getUnpublishedTopics(limit = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM topics
    WHERE published_telegram = 0
    AND (factcheck_verdict IS NOT NULL OR sources_count >= 2)
    ORDER BY trending_score DESC, sources_count DESC
    LIMIT ?
  `).all(limit);
}

export function markAsPublished(ids) {
  const db = getDb();
  const stmt = db.prepare('UPDATE topics SET published_telegram = 1 WHERE id = ?');
  const transaction = db.transaction((ids) => ids.map(id => stmt.run(id)));
  return transaction(ids);
}

export function getRecentTopics(hours = 24, country = null) {
  const db = getDb();
  let query = 'SELECT * FROM topics WHERE first_seen >= datetime(\'now\', ?)';
  const params = ['-' + hours + ' hours'];
  if (country) {
    query += ' AND country = ?';
    params.push(country);
  }
  query += ' ORDER BY trending_score DESC';
  return db.prepare(query).all(...params);
}

export function getStats() {
  const db = getDb();
  return db.prepare(`
    SELECT
      COUNT(*) as total_topics,
      SUM(CASE WHEN published_telegram = 1 THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN factcheck_verdict IS NOT NULL THEN 1 ELSE 0 END) as factchecked,
      SUM(CASE WHEN factcheck_verdict = 'false' THEN 1 ELSE 0 END) as false_verdicts,
      SUM(CASE WHEN factcheck_verdict = 'true' THEN 1 ELSE 0 END) as true_verdicts,
      AVG(sources_count) as avg_sources
    FROM topics
  `).get();
}
