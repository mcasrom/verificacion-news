import fetch from 'node-fetch';
import AdmZip from 'adm-zip';

const GDELT_GKG_URL = 'http://data.gdeltproject.org/gkg/';

// GDELT 1.0 GKG columns (11 tab-separated)
// 0:DATE 1:NUMARTS 2:COUNTS 3:THEMES 4:LOCATIONS
// 5:PERSONS 6:ORGANIZATIONS 7:TONE 8:CAMEOEVENTIDS 9:SOURCES 10:SOURCEURLS

function getDailyFiles() {
  const now = new Date();
  const files = [];
  for (let d = 0; d < 3; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, '');
    files.push(yyyymmdd + '.gkg.csv.zip');
  }
  return files;
}

function parseCounts(countsStr) {
  const entities = [];
  if (!countsStr) return entities;
  const parts = countsStr.split(';');
  for (const part of parts) {
    const segs = part.split('#');
    if (segs.length >= 3) {
      const count = parseInt(segs[0]) || 1;
      const type = segs[1];
      const name = segs.slice(2).join('#').trim();
      if (name && name.length > 1) {
        entities.push({ name, type, count });
      }
    }
  }
  return entities;
}

function extractReadableName(themeCode) {
  // Convert GDELT theme codes to readable text
  const parts = themeCode.split('_');
  return parts
    .map(p => p.charAt(0) + p.slice(1).toLowerCase())
    .filter(p => p.length > 1)
    .join(' ');
}

// Known high-value theme prefixes that indicate meaningful topics
const MEANINGFUL_THEMES = new Set([
  'TAX', 'WB', 'SOC', 'NATURAL_DISASTER', 'GENERAL', 'EPU',
  'UNGP', 'CRISISLEX', 'USP', 'MIL', 'ECON', 'GOV', 'MED',
  'HLTH', 'EDU', 'ENERGY', 'ENV', 'TECH', 'CRIME', 'TERROR',
  'HUMAN_RIGHTS', 'DIPLOMACY', 'TRADE', 'IMMIGRATION'
]);

function isReadableTheme(theme) {
  if (!theme || theme.length < 5) return false;
  if (/^\d/.test(theme)) return false;
  if (theme.length > 80) return false;
  if (/^[A-Z0-9_]+$/.test(theme)) return true;
  return false;
}

export async function fetchGDELT() {
  const files = getDailyFiles();
  const allItems = [];

  for (const zipName of files) {
    try {
      const url = GDELT_GKG_URL + zipName;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }
      });

      if (!response.ok) {
        console.log('[GDELT] ' + zipName + ' not available (' + response.status + ')');
        continue;
      }

      const buffer = await response.arrayBuffer();
      const zip = new AdmZip(Buffer.from(buffer));
      const csvEntry = zip.getEntries().find(e =>
        e.entryName.endsWith('.csv') || e.entryName.endsWith('.gkg.csv')
      );
      if (!csvEntry) {
        console.log('[GDELT] No CSV in ' + zipName);
        continue;
      }

      const csvContent = csvEntry.getData().toString('utf8');
      const lines = csvContent.split('\n').slice(0, 8000);

      for (const line of lines) {
        if (!line.trim()) continue;

        const parts = line.split('\t');
        if (parts.length < 11) continue;

        const date = parts[0] || '';
        const sourceName = parts[9] || ''; // SOURCES column
        const sourceUrls = parts[10] || ''; // SOURCEURLS column
        const themesRaw = parts[3] || ''; // THEMES column
        const entitiesRaw = parts[2] || ''; // COUNTS column
        const personsRaw = parts[5] || ''; // PERSONS column
        const orgsRaw = parts[6] || ''; // ORGANIZATIONS column
        const locationsRaw = parts[4] || ''; // LOCATIONS column
        const toneRaw = parts[7] || ''; // TONE column

        const themes = themesRaw.split(';')
          .map(t => t.trim())
          .filter(t => isReadableTheme(t));

        if (themes.length === 0) continue;

        // Parse entities from COUNTS
        const entities = parseCounts(entitiesRaw);

        // Get first URL from source URLs
        const firstUrl = sourceUrls.split(';')[0] || '';
        const firstSource = sourceName.split(';')[0] || '';

        // Parse tone for trending score weighting
        const toneValues = toneRaw.split(',').map(Number);
        const avgTone = toneValues[0] || 0;

        allItems.push({
          date,
          source: firstSource,
          url: firstUrl,
          themes,
          entities,
          persons: personsRaw.split(';').filter(p => p.trim()).slice(0, 5),
          organizations: orgsRaw.split(';').filter(o => o.trim()).slice(0, 5),
          locations: locationsRaw.split(';').filter(l => l.trim()).slice(0, 3),
          avgTone,
          // Use first readable theme or entity name as headline proxy
          headline: extractReadableName(themes[0]) || entities[0]?.name || themes[0]
        });
      }

      console.log('[GDELT] ' + zipName + ': ' + allItems.length + ' items parsed');
    } catch (e) {
      console.error('[GDELT] Error processing ' + zipName + ':', e.message);
    }
  }

  return allItems;
}

export function extractTrendingTopics(gdeltData) {
  const themeCount = {};
  const themeSources = {};
  const themeEntities = {};
  const themePersons = {};

  for (const item of gdeltData) {
    for (const theme of item.themes) {
      if (!themeCount[theme]) {
        themeCount[theme] = 0;
        themeSources[theme] = new Set();
        themeEntities[theme] = {};
        themePersons[theme] = new Set();
      }
      themeCount[theme]++;
      if (item.source) themeSources[theme].add(item.source);

      // Track named entities per theme
      for (const e of item.entities || []) {
        themeEntities[theme][e.name] = (themeEntities[theme][e.name] || 0) + e.count;
      }
      for (const p of item.persons || []) {
        themePersons[theme].add(p);
      }
    }
  }

  const trending = [];
  for (const [theme, count] of Object.entries(themeCount)) {
    const uniqueSources = themeSources[theme].size;
    if (count < 2) continue;

    // Find top entity/name for this theme
    const entities = themeEntities[theme] || {};
    const topEntity = Object.entries(entities).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topPerson = [...(themePersons[theme] || [])].slice(0, 2);

    // Generate human-readable headline
    let headline = extractReadableName(theme);
    if (topPerson.length > 0) {
      headline = topPerson[0] + ' - ' + headline;
    } else if (topEntity.length > 0 && topEntity[0][0].length > 2) {
      headline = headline + ': ' + topEntity[0][0];
    }

    const freshnessBonus = Math.min(count / 100, 2);
    const sourceBonus = Math.min(uniqueSources * 2, 5);

    trending.push({
      theme: headline,
      count,
      uniqueSources,
      score: count * (1 + freshnessBonus) * (1 + sourceBonus),
      category: categorizeTheme(theme)
    });
  }

  return trending.sort((a, b) => b.score - a.score).slice(0, 25);
}

function categorizeTheme(theme) {
  const t = theme.toUpperCase();
  if (t.includes('ELECC') || t.includes('GOVERN') || t.includes('POLIT') || t.includes('PRESIDENT')) return 'politica';
  if (t.includes('ECON') || t.includes('TAX') || t.includes('TRADE') || t.includes('MARKET')) return 'economia';
  if (t.includes('HLTH') || t.includes('HEALTH') || t.includes('MEDICAL') || t.includes('COVID')) return 'salud';
  if (t.includes('MIL') || t.includes('TERROR') || t.includes('CRIME') || t.includes('WAR')) return 'seguridad';
  if (t.includes('DISASTER') || t.includes('FLOOD') || t.includes('EARTHQUAKE') || t.includes('CLIMATE')) return 'medioambiente';
  if (t.includes('TECH') || t.includes('SCIENCE') || t.includes('DIGITAL')) return 'ciencia';
  return 'general';
}
