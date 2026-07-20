import crypto from 'crypto';
import { insertTopic, updateTopicSources, getDb } from './db.js';
import { searchFactCheck, buildFactCheckQuery } from './sources/factcheck.js';

export function generateHash(headline) {
  const normalized = headline
    .toLowerCase()
    .replace(/[^\w\sáéíóúñ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export async function processTrendingTopics(trending, gdeltData, rssItems, factCheckApiKey) {
  const processed = [];
  
  for (const topic of trending.slice(0, 15)) {
    const hash = generateHash(topic.theme);
    
    const existing = getDb().prepare('SELECT id, sources_count FROM topics WHERE hash = ?').get(hash);
    
    if (existing) {
      const newSourceCount = Math.max(existing.sources_count, topic.uniqueSources);
      updateTopicSources(hash, newSourceCount, topic.theme);
      continue;
    }
    
    const factcheck = await searchFactCheck(
      buildFactCheckQuery(topic.theme), 
      factCheckApiKey
    );
    
    const riskSignal = assessRisk(topic, factcheck, rssItems);
    
    const topicData = {
      hash,
      headline: topic.theme,
      summary: topic.summary || `Trending in ${topic.uniqueSources} sources`,
      sourcesCount: topic.uniqueSources,
      sourceNames: [...new Set(topic.relatedItems?.map(i => i.source) || [])].join(', '),
      factcheckVerdict: factcheck?.verdict || null,
      factcheckSource: factcheck?.source || null,
      factcheckUrl: factcheck?.url || null,
      riskSignal,
      country: detectCountry(topic.theme),
      topicCategory: topic.category || categorizeTopic(topic.theme),
      trendingScore: topic.score,
      articleLink: topic.link || null,
      imageUrl: topic.image || null
    };
    
    insertTopic(topicData);
    processed.push(topicData);
  }
  
  return processed;
}

function assessRisk(topic, factcheck, rssItems) {
  if (factcheck) {
    if (factcheck.verdict === 'false') return 'DESMENTIDO - Verificado falso por ' + factcheck.source;
    if (factcheck.verdict === 'true') return 'VERIFICADO - Confirmado por ' + factcheck.source;
    if (factcheck.verdict === 'misleading') return 'ENGAÑOSO - ' + factcheck.source;
  }
  
  const matchingArticles = rssItems.filter(item => 
    item.title && item.title.toLowerCase().includes(topic.theme.toLowerCase().slice(0, 20))
  );
  
  if (matchingArticles.length < 2) {
    return 'SIN VERIFICAR - Poca cobertura de medios establecidos';
  }
  
  const categories = new Set(matchingArticles.map(a => a.category));
  if (categories.size > 2) {
    return 'COBERTURA MIXTA - Medios con diferentes líneas editoriales lo cubren diferente';
  }
  
  return 'SIN VERIFICAR - ' + matchingArticles.length + ' medios lo cubren';
}

function detectCountry(headline) {
  const lower = headline.toLowerCase();
  
  const countries = {
    'estados unidos': 'US', 'united states': 'US', 'usa': 'US', 'trump': 'US', 'biden': 'US',
    'china': 'CN', 'chino': 'CN', 'beijing': 'CN',
    'rusia': 'RU', 'russia': 'RU', 'putin': 'RU',
    'ukraine': 'UA', 'ucrania': 'UA', 'zelensky': 'UA',
    'israel': 'IL', 'gaza': 'IL', 'palestine': 'PS',
    'mexico': 'MX', 'méxico': 'MX', 'amlo': 'MX', 'sheinbaum': 'MX',
    'españa': 'ES', 'spain': 'ES', 'sánchez': 'ES',
    'venezuela': 'VE', 'maduro': 'VE',
    'argentina': 'AR', 'milei': 'AR',
    'colombia': 'CO', 'petro': 'CO',
    'brasil': 'BR', 'bolsonaro': 'BR', 'lula': 'BR',
  };
  
  for (const [keyword, code] of Object.entries(countries)) {
    if (lower.includes(keyword)) return code;
  }
  
  return 'global';
}

function categorizeTopic(headline) {
  const lower = headline.toLowerCase();
  
  if (lower.includes('elecc') || lower.includes('president') || lower.includes('gobierno') || lower.includes('vote')) return 'politica';
  if (lower.includes('econom') || lower.includes('inflación') || lower.includes('dólar') || lower.includes('mercado')) return 'economia';
  if (lower.includes('salud') || lower.includes('virus') || lower.includes('covid') || lower.includes('hospital')) return 'salud';
  if (lower.includes('guerra') || lower.includes('militar') || lower.includes('ejército') || lower.includes('armas')) return 'seguridad';
  if (lower.includes('clima') || lower.includes('terremoto') || lower.includes('inundación') || lower.includes('desastre')) return 'medioambiente';
  
  return 'general';
}
