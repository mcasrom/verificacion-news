import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

const RSS_FEEDS = [
{ name: 'Infodefensa', url: 'https://www.infodefensa.com/feed/all', category: 'defensa' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'agencia' },
  { name: 'BBC Mundo', url: 'https://feeds.bbci.co.uk/mundo/topics/c7zp57yyz25t/rss.xml', category: 'agencia' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'agencia' },
  { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-en-all', category: 'agencia' },
  { name: 'France24', url: 'https://www.france24.com/en/rss', category: 'agencia' },
  { name: 'El País', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', category: 'espanol' },
  { name: 'El Mundo', url: 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml', category: 'espanol' },
  { name: 'La Vanguardia', url: 'https://www.lavanguardia.com/rss/feed5022031.xml', category: 'espanol' },
  { name: 'Clarín', url: 'https://www.clarin.com/rss/lo-ultimo/', category: 'latam' },
  { name: 'El Universal MX', url: 'https://www.eluniversal.com.mx/rss.xml', category: 'latam' },
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', category: 'generalista' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', category: 'generalista' },
];

function decodeXMLNumericEntities(text) {
  return text.replace(/&#x?[0-9a-fA-F]+;/g, (match) => {
    try {
      const hex = match.startsWith('&#x');
      const code = hex ? parseInt(match.slice(3, -1), 16) : parseInt(match.slice(2, -1), 10);
      return String.fromCodePoint(code);
    } catch {
      return ' ';
    }
  });
}

const parser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name === 'item' || name === 'entry',
  processEntities: false,
  stopNodes: ["*"] // Avoid entity expansion limit
});

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

      let text = await response.text();
      text = stripXMLEntities(text);
      const parsed = parser.parse(text);

      let items = [];
      if (parsed.rss?.channel?.item) {
        items = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
      } else if (parsed.feed?.entry) {
        items = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
      }

      return items.slice(0, 25).map(item => {
        const title = item.title?._text || item.title?.['#text'] || item.title || '';
        const link = item.link?.['@_href'] || item.link?._text || item.link || '';
        const desc = item.description?._text || item.description || item.summary || '';

        let image = null;
        if (item['media:content']?.['@_url']) {
          image = item['media:content']['@_url'];
        } else if (item['media:thumbnail']?.['@_url']) {
          image = item['media:thumbnail']['@_url'];
        } else if (item.enclosure?.['@_url']) {
          image = item.enclosure['@_url'];
        } else if (item['media:group']) {
          const group = Array.isArray(item['media:group']) ? item['media:group'][0] : item['media:group'];
          if (group?.['media:content']?.['@_url']) {
            image = group['media:content']['@_url'];
          }
        }

        return {
          source: feed.name,
          category: feed.category,
          title: String(title).trim(),
          link: String(link).trim(),
          pubDate: item.pubDate?._text || item.pubDate || item.published || '',
          description: String(desc).slice(0, 500).trim(),
          image: image || null
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

export function detectRSSTrending(rssItems) {
  const STOP_WORDS = new Set(['the','and','for','that','with','this','from','have','are','was','were','been','has','its','not','but','can','will','into','over','after','says','new','two','may','first','last','year','time','people','world','city','state','country','government','president','minister','official','according','report']);

  const headlines = rssItems
    .filter(item => item.title && item.title.length > 15)
    .map(item => ({
      ...item,
      words: new Set(
        item.title.toLowerCase()
          .replace(/[^\w\sáéíóúñ]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 3 && !STOP_WORDS.has(w))
      )
    }));

  const groups = [];
  const used = new Set();

  for (let i = 0; i < headlines.length; i++) {
    if (used.has(i)) continue;

    const group = [headlines[i]];
    used.add(i);

    for (let j = i + 1; j < headlines.length; j++) {
      if (used.has(j)) continue;

      const overlap = [...headlines[i].words].filter(w => headlines[j].words.has(w)).length;
      const minWords = Math.min(headlines[i].words.size, headlines[j].words.size);

      if (minWords > 0 && overlap / minWords > 0.4) {
        group.push(headlines[j]);
        used.add(j);
      }
    }

    if (group.length >= 2) {
      const sources = new Set(group.map(g => g.source));
      const best = group.sort((a, b) => b.title.length - a.title.length)[0];

      groups.push({
        theme: best.title,
        summary: group.length > 2
          ? `${group.length} medios cubren: ${best.title}`
          : group.map(g => `${g.source}: ${g.title}`).join(' | '),
        count: group.length,
        uniqueSources: sources.size,
        score: group.length * sources.size,
        relatedItems: group.map(g => ({
          title: g.title,
          source: g.source,
          link: g.link,
          description: g.description || '',
          image: g.image || null
        })),
        link: best.link,
        image: best.image,
        category: best.category
      });
    }
  }

  return groups.sort((a, b) => b.score - a.score).slice(0, 15);
}

function stripXMLEntities(text) {
  // Remove all entity references before XML parsing
  return text
    .replace(/&#x?[0-9a-fA-F]+;/g, ' ')
    .replace(/&[a-zA-Z]+;/g, ' ')
    .replace(/&(?![a-zA-Z])/g, ' ');
}
