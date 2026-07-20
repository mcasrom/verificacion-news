import 'dotenv/config';
import { getDb, getUnpublishedTopics, markAsPublished, getStats } from './db.js';
import { fetchGDELT, extractTrendingTopics } from './sources/gdelt.js';
import { fetchRSS, matchHeadlines, detectRSSTrending } from './sources/rss.js';
import { processTrendingTopics } from './verify.js';
import { publishToChannel } from './telegram.js';
import { TEST_GDELT_DATA, TEST_RSS_ITEMS } from './testdata.js';

const CONFIG = {
  factCheckApiKey: process.env.FACT_CHECK_API_KEY || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChannelId: process.env.TELEGRAM_CHANNEL_ID || '',
  minSourcesToTrend: parseInt(process.env.MIN_SOURCES || '3'),
  runInterval: parseInt(process.env.RUN_INTERVAL_MIN || '15'),
  useTestData: process.argv.includes('--test'),
};

async function runCycle() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting cycle...`);
  
  try {
    // Step 1: Fetch data sources
    console.log('[1/4] Fetching data sources...');
    let gdeltData, rssItems;
    
    if (CONFIG.useTestData) {
      console.log('  Using test data...');
      gdeltData = TEST_GDELT_DATA;
      rssItems = TEST_RSS_ITEMS;
    } else {
      [gdeltData, rssItems] = await Promise.all([
        fetchGDELT().catch(e => { console.error('  GDELT error:', e.message); return []; }),
        fetchRSS().catch(e => { console.error('  RSS error:', e.message); return []; })
      ]);
    }
    
    console.log(`  GDELT: ${gdeltData.length} items | RSS: ${rssItems.length} items`);
    
    if (gdeltData.length === 0 && rssItems.length === 0) {
      console.log('  No data available - skipping cycle');
      return;
    }
    
    // Step 2: Detect trending
    console.log('[2/4] Detecting trending topics...');
    const gdeltTrending = extractTrendingTopics(gdeltData);
    const rssTrending = detectRSSTrending(rssItems);
    
    // Combine and dedupe
    const combined = [...gdeltTrending, ...rssTrending];
    
    combined.sort((a, b) => b.score - a.score);
    const topTrending = combined.slice(0, 10);
    console.log(`  Found ${combined.length} candidates, processing top ${topTrending.length}`);
    
    // Step 3: Verify and store
    console.log('[3/4] Verifying and storing...');
    const processed = await processTrendingTopics(
      topTrending,
      gdeltData,
      rssItems,
      CONFIG.factCheckApiKey
    );
    console.log(`  Processed ${processed.length} new topics`);
    
    // Step 4: Publish
    console.log('[4/4] Publishing...');
    const unsent = getUnpublishedTopics(5);
    if (unsent.length > 0 && CONFIG.telegramBotToken && CONFIG.telegramChannelId) {
      const published = await publishToChannel(CONFIG.telegramBotToken, CONFIG.telegramChannelId, unsent);
      if (published.length > 0) {
        markAsPublished(published);
        console.log(`  Published ${published.length} topics to Telegram`);
      }
    } else if (unsent.length > 0) {
      console.log(`  ${unsent.length} topics ready but Telegram not configured`);
    } else {
      console.log('  No topics to publish');
    }
    
    // Stats
    const stats = getStats();
    console.log(`[Stats] Total: ${stats.total_topics || 0} | Published: ${stats.published || 0} | Factchecked: ${stats.factchecked || 0}`);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Done] Cycle completed in ${elapsed}s\n`);
    
  } catch (e) {
    console.error('[Error] Cycle failed:', e.message);
    console.error(e.stack);
  }
}

async function main() {
  console.log('=== NewsRadar - Verificación de Noticias ===');
  console.log(`Interval: ${CONFIG.runInterval} minutes`);
  console.log(`FactCheck API: ${CONFIG.factCheckApiKey ? 'Configured' : 'NOT SET'}`);
  console.log(`Telegram: ${CONFIG.telegramBotToken ? 'Configured' : 'NOT SET'}`);
  console.log('');
  
  if (process.argv.includes('--run-now')) {
    await runCycle();
    process.exit(0);
  }
  
  console.log('Starting continuous mode...\n');
  await runCycle();
  
  setInterval(runCycle, CONFIG.runInterval * 60 * 1000);
}

main();
