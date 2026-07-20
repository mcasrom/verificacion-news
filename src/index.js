import 'dotenv/config';
import { getDb, getUnpublishedTopics, markAsPublished, getStats, updateTopicImprovements } from './db.js';
import { fetchGDELT, extractTrendingTopics } from './sources/gdelt.js';
import { fetchRSS, detectRSSTrending } from './sources/rss.js';
import { processTrendingTopics } from './verify.js';
import { publishToChannel } from './telegram.js';
import { improveContent } from './gemini.js';
import { TEST_GDELT_DATA, TEST_RSS_ITEMS } from './testdata.js';

const CONFIG = {
  factCheckApiKey: process.env.FACT_CHECK_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChannelId: process.env.TELEGRAM_CHANNEL_ID || '',
  minSourcesToTrend: parseInt(process.env.MIN_SOURCES || '3'),
  runInterval: parseInt(process.env.RUN_INTERVAL_MIN || '15'),
  useTestData: process.argv.includes('--test'),
};

function isGoodHeadline(h) {
  if (!h || h.length < 15) return false;
  if (/^[\d,.\s-]+$/.test(h)) return false;
  if (/^[A-Z_]{10,}$/.test(h)) return false;
  if (/^(tax|wb|uspec|crisislex|ungp)_/i.test(h)) return false;
  return true;
}

function combineTrending(rssTrending, gdeltTrending) {
  const combined = [];
  const seenThemes = new Set();

  // RSS topics = primary content. Always include, max 10
  for (const rss of rssTrending) {
    if (combined.length >= 10) break;

    const key = rss.theme.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
    if (seenThemes.has(key)) continue;
    seenThemes.add(key);

    // Check GDELT boost
    const gdeltBoost = gdeltTrending.filter(g => {
      const gKey = g.theme.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
      const rKey = key.slice(0, 20);
      return rKey.includes(gKey) || gKey.includes(rKey);
    }).length;

    if (gdeltBoost > 0) {
      rss.gdeltConfirmed = true;
      rss.score *= 1.3;
    }

    rss.isRSS = true;
    combined.push(rss);
  }

  // Fill remaining slots with quality GDELT topics (score capped)
  if (combined.length < 10) {
    const maxRS = combined.length > 0 ? Math.max(...combined.map(t => t.score)) : 5;

    for (const g of gdeltTrending) {
      if (combined.length >= 10) break;

      const gKey = g.theme.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
      if (seenThemes.has(gKey)) continue;

      // Check overlap with existing RSS topics
      const overlaps = [...seenThemes].some(s =>
        s.includes(gKey.slice(0, 15)) || gKey.includes(s.slice(0, 15))
      );
      if (overlaps) continue;
      if (!isGoodHeadline(g.theme)) continue;
      if (g.uniqueSources < 2) continue;

      seenThemes.add(gKey);
      g.isRSS = false;

      // Cap GDELT score to not dominate RSS
      g.score = Math.min(g.score, maxRS * 2);
      g.uniqueSources = Math.min(g.uniqueSources, 5);

      combined.push(g);
    }
  }

  combined.sort((a, b) => b.score - a.score);
  return combined.slice(0, 10);
}

async function runCycle() {
  const startTime = Date.now();
  console.log('[' + new Date().toISOString() + '] Starting cycle...');

  try {
    console.log('[1/4] Fetching data sources...');
    let gdeltData, rssItems;

    if (CONFIG.useTestData) {
      gdeltData = TEST_GDELT_DATA;
      rssItems = TEST_RSS_ITEMS;
    } else {
      [gdeltData, rssItems] = await Promise.all([
        fetchGDELT().catch(e => { console.error('  GDELT error:', e.message); return []; }),
        fetchRSS().catch(e => { console.error('  RSS error:', e.message); return []; })
      ]);
    }

    console.log('  GDELT: ' + gdeltData.length + ' items | RSS: ' + rssItems.length + ' items');
    if (gdeltData.length === 0 && rssItems.length === 0) {
      console.log('  No data');
      return;
    }

    console.log('[2/4] Detecting trending topics...');
    const gdeltTrending = extractTrendingTopics(gdeltData);
    const rssTrending = detectRSSTrending(rssItems);
    const topTrending = combineTrending(rssTrending, gdeltTrending);

    console.log('  RSS: ' + rssTrending.length + ' | GDELT: ' + gdeltTrending.length
      + ' | Selected: ' + topTrending.length
      + ' (RSS: ' + topTrending.filter(t => t.isRSS).length
      + ', GDELT: ' + topTrending.filter(t => !t.isRSS).length + ')');

    console.log('[3/4] Verifying and storing...');
    const processed = await processTrendingTopics(topTrending, gdeltData, rssItems, CONFIG.factCheckApiKey);
    console.log('  New topics: ' + processed.length);

    console.log('[4/5] Improving content with Groq...');
    const unsent = getUnpublishedTopics(5);
    let improvedCount = 0;

    if (unsent.length > 0 && CONFIG.groqApiKey) {
      await Promise.all(unsent.map(async (topic) => {
        try {
          const improved = await improveContent({
            headline: topic.headline,
            summary: topic.summary || '',
            riskSignal: topic.risk_signal || 'SIN VERIFICAR',
            factcheckSource: topic.factcheck_source || '',
            country: topic.country || 'global',
            topicCategory: topic.topic_category || 'general',
            sourceCount: topic.sources_count || 1
          }, CONFIG.groqApiKey);

          if (improved) {
            updateTopicImprovements(topic.id, improved.improvedHeadline, improved.improvedSummary, improved.suggestedEmoji);
            topic.improved_headline = improved.improvedHeadline;
            topic.improved_summary = improved.improvedSummary;
            topic.suggested_emoji = improved.suggestedEmoji;
            improvedCount++;
          }
        } catch (e) {
          console.error('  Groq error #' + topic.id + ':', e.message);
        }
      }));
      console.log('  Improved: ' + improvedCount + '/' + unsent.length);
    }

    console.log('[5/5] Publishing...');
    if (unsent.length > 0 && CONFIG.telegramBotToken && CONFIG.telegramChannelId) {
      const published = await publishToChannel(CONFIG.telegramBotToken, CONFIG.telegramChannelId, unsent);
      if (published.length > 0) {
        markAsPublished(published);
        console.log('  Published: ' + published.length);
      }
    } else if (unsent.length > 0) {
      console.log('  ' + unsent.length + ' topics ready, Telegram not configured');
    } else {
      console.log('  Nothing to publish');
    }

    const stats = getStats();
    console.log('[Stats] Total: ' + (stats.total_topics || 0)
      + ' | Published: ' + (stats.published || 0)
      + ' | Checked: ' + (stats.factchecked || 0));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('[Done] ' + elapsed + 's\n');

  } catch (e) {
    console.error('[Error]', e.message);
    console.error(e.stack);
  }
}

async function main() {
  console.log('=== NewsRadar Verifica ===');
  console.log('FactCheck: ' + (CONFIG.factCheckApiKey ? 'OK' : 'NO'));
  console.log('Groq: ' + (CONFIG.groqApiKey ? 'OK' : 'NO'));
  console.log('Telegram: ' + (CONFIG.telegramBotToken ? 'OK' : 'NO'));
  console.log('');

  await runCycle();

  if (process.argv.includes('--continuous')) {
    setInterval(runCycle, CONFIG.runInterval * 60 * 1000);
  } else {
    process.exit(0);
  }
}

main();
