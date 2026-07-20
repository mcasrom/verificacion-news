import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

const RSS_FEEDS = [
  // Agencias internacionales (confiables) - todos HTTPS
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'agencia' },
  { name: 'BBC Mundo', url: 'https://feeds.bbci.co.uk/mundo/topics/c7zp57yyz25t/rss.xml', category: 'agencia' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'agencia' },
  { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-en-all', category: 'agencia' },
  { name: 'France24', url: 'https://www.france24.com/en/rss', category: 'agencia' },
  
  // España
  { name: 'El País', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', category: 'espanol' },
  { name: 'El Mundo', url: 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml', category: 'espanol' },
  { name: 'La Vanguardia', url: 'https://www.lavanguardia.com/rss/feed5022031.xml', category: 'espanol' },
  
  // América Latina
  { name: 'Clarín', url: 'https://www.clarin.com/rss/lo-ultimo/', category: 'latam' },
  { name: 'El Universal MX', url: 'https://www.eluniversal.com.mx/rss.xml', category: 'latam' },
  
  // Alternativos/Estados Unidos
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', category: 'generalista' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', category: 'generalista' },
];

const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === 'item' });

export async function fetchRSS() {
  const allItems = [];
  
  const feedPromises = RSS_FEEDS.map(async (feed) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      
      const response = await fetch(feed.url, { 
        signal: controller.signal,
        redirect: 'follow',
        headers: { 
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      });
      clearTimeout(timeout);
      
      if (!response.ok) return [];
      
      const text = await response.text();
      const parsed = parser.parse(text);
      
      let items = [];
      if (parsed.rss?.channel?.item) {
        items = parsed.rss.channel.item;
      } else if (parsed.feed?.entry) {
        items = Array.isArray(parsed.feed.entry) 
          ? parsed.feed.entry 
          : [parsed.feed.entry];
      }
      
      return items.slice(0, 20).map(item => {
        // Handle different RSS formats
        const title = item.title?._text || item.title || '';
        const link = item.link?.['@_href'] || item.link?._text || item.link || '';
        const desc = item.description?._text || item.description || item.summary || '';
        
        return {
          source: feed.name,
          category: feed.category,
          title: String(title).trim(),
          link: String(link).trim(),
          pubDate: item.pubDate?._text || item.pubDate || item.published || '',
          description: String(desc).slice(0, 500).trim()
        };
      });
      
    } catch (e) {
      console.error(`[RSS] Error fetching ${feed.name}:`, e.message);
      return [];
    }
  });
  
  const results = await Promise.all(feedPromises);
  return results.flat();
}

export function matchHeadlines(rssItems) {
  const matched = [];
  
  for (const item of rssItems) {
    if (!item.title) continue;
    
    const similar = rssItems.filter(other => 
      other.source !== item.source && 
      other.title &&
      calculateSimilarity(item.title, other.title) > 0.3
    );
    
    if (similar.length >= 2) {
      matched.push({
        headline: item.title,
        sources: [item.source, ...similar.map(s => s.source)],
        category: item.category,
        link: item.link
      });
    }
  }
  
  return matched;
}

function calculateSimilarity(a, b) {
  const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  let matches = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) matches++;
  }
  
  return matches / Math.max(wordsA.length, 1);
}

export function detectRSSTrending(rssItems) {
  const STOP_WORDS = new Set(['the','and','for','that','with','this','from','have','are','was','were','been','has','its','not','but','can','will','into','over','after','says','new','two','may','first','last','year','time','people','world','city','state','country','government','president','minister','official','according','report']);
  
  const keywordCount = {};
  const keywordItems = {};
  
  for (const item of rssItems) {
    if (!item.title) continue;
    
    const words = item.title.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    
    const uniqueWords = [...new Set(words)];
    
    for (const word of uniqueWords) {
      if (!keywordCount[word]) {
        keywordCount[word] = 0;
        keywordItems[word] = [];
      }
      keywordCount[word]++;
      keywordItems[word].push(item);
    }
  }
  
  const topics = [];
  for (const [keyword, count] of Object.entries(keywordCount)) {
    if (count >= 3) {
      const items = keywordItems[keyword];
      const sources = new Set(items.map(i => i.source));
      
      topics.push({
        theme: keyword.charAt(0).toUpperCase() + keyword.slice(1),
        count,
        uniqueSources: sources.size,
        score: count * sources.size,
        relatedItems: items.slice(0, 5).map(i => ({ title: i.title, source: i.source, link: i.link }))
      });
    }
  }
  
  return topics.sort((a, b) => b.score - a.score).slice(0, 20);
}
