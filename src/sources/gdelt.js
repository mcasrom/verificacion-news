import fetch from 'node-fetch';

// GDELT usa HTTP - su SSL tiene problemas con CDN de Google
const GDELT_GKG_URL = 'http://data.gdeltproject.org/gkg/';
const GDELT_EVENTS_URL = 'http://data.gdeltproject.org/events/';

function getLast24HoursFiles() {
  const now = new Date();
  const files = [];
  
  for (let i = 0; i < 24; i += 15) {
    const d = new Date(now - i * 60000);
    const YYYYMMDD = d.toISOString().slice(0, 10).replace(/-/g, '');
    const HHMM = `${String(d.getHours()).padStart(2, '0')}${String(Math.floor(d.getMinutes() / 15) * 15).padStart(2, '0')}`;
    files.push(`${YYYYMMDD}${HHMM}.translation.CSV`);
  }
  
  return files;
}

export async function fetchGDELT() {
  const files = getLast24HoursFiles();
  const allThemes = [];
  
  for (const file of files.slice(0, 4)) {
    try {
      const url = `${GDELT_GKG_URL}${file}`;
      const response = await fetch(url);
      
      if (!response.ok) continue;
      
      const text = await response.text();
      const lines = text.split('\n').slice(0, 100);
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const parts = line.split('\t');
        if (parts.length < 7) continue;
        
        const [date, source, url, themes, title] = parts;
        
        const themeList = themes ? themes.split(';').filter(t => t.length > 0) : [];
        
        allThemes.push({
          date,
          source,
          url,
          themes: themeList,
          title: title || '',
          headline: title || ''
        });
      }
      
    } catch (e) {
      console.error(`[GDELT] Error fetching ${file}:`, e.message);
    }
  }
  
  return allThemes;
}

export function extractTrendingTopics(gdeltData) {
  const themeCount = {};
  const themeSources = {};
  
  for (const item of gdeltData) {
    for (const theme of item.themes) {
      if (!themeCount[theme]) {
        themeCount[theme] = 0;
        themeSources[theme] = new Set();
      }
      themeCount[theme]++;
      if (item.source) themeSources[theme].add(item.source);
    }
  }
  
  const trending = [];
  for (const [theme, count] of Object.entries(themeCount)) {
    const uniqueSources = themeSources[theme].size;
    
    // Lower threshold for trending: 2+ sources or 3+ mentions
    if (uniqueSources >= 2 || count >= 3) {
      trending.push({
        theme,
        count,
        uniqueSources,
        score: count * uniqueSources
      });
    }
  }
  
  return trending.sort((a, b) => b.score - a.score).slice(0, 20);
}
