import crypto from 'crypto';
import { insertTopic, updateTopicSources, getDb } from './db.js';
import { searchFactCheck, buildFactCheckQuery } from './sources/factcheck.js';
import { extractClaim, analyzeCoherence } from './gemini.js';

export function generateHash(headline) {
  const normalized = headline.toLowerCase().replace(/[^\w\s\xe1\xe9\xed\xf3\xfa\xf1]/gi, ' ').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function jaccardSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

function crossReferenceHistorical(headline) {
  const db = getDb();
  const words = headline.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  if (words.length < 2) return null;

  // Find topics that share significant word overlap
  const allTopics = db.prepare('SELECT id, headline, factcheck_verdict, factcheck_source, first_seen, risk_signal FROM topics WHERE factcheck_verdict IS NOT NULL ORDER BY first_seen DESC LIMIT 100').all();
  let best = null;
  let bestScore = 0;

  for (const t of allTopics) {
    const score = jaccardSimilarity(headline, t.headline || '');
    if (score > 0.35 && score > bestScore) {
      best = t;
      bestScore = score;
    }
  }

  if (best) {
    return {
      id: best.id,
      headline: best.headline,
      verdict: best.factcheck_verdict,
      source: best.factcheck_source,
      date: best.first_seen,
      signal: best.risk_signal,
      similarity: Math.round(bestScore * 100)
    };
  }
  return null;
}

function assessRisk(topic, factcheck, rssItems, gdeltItems) {
  if (factcheck) {
    if (factcheck.verdict === 'false') return 'DESMENTIDO - Verificado falso por ' + factcheck.source;
    if (factcheck.verdict === 'true') return 'VERIFICADO - Confirmado por ' + factcheck.source;
    if (factcheck.verdict === 'misleading') return 'ENGA\u00d1OSO - ' + factcheck.source;
  }

  const sample = topic.theme.toLowerCase().slice(0, 25);
  const matchingArticles = rssItems.filter(item => item.title && item.title.toLowerCase().includes(sample));

  const gdeltMatchCount = gdeltItems.filter(item =>
    item.themes && item.themes.some(t => t.toLowerCase().includes(sample.slice(0, 15)))
  ).length;

  // Cross-reference historical
  const xref = crossReferenceHistorical(topic.theme);
  if (xref && (xref.verdict === 'false' || xref.verdict === 'misleading')) {
    return 'REINCIDENTE - Mismo patr\u00f3n detectado el ' + (xref.date || 'antes')
      + '. Previo: ' + xref.verdict.toUpperCase() + ' por ' + (xref.source || 'fact-checker')
      + ' (similitud ' + xref.similarity + '%)';
  }

  if (matchingArticles.length >= 3) {
    const pairs = [];
    for (let i = 0; i < matchingArticles.length; i++) {
      for (let j = i + 1; j < matchingArticles.length; j++) {
        pairs.push(jaccardSimilarity(matchingArticles[i].title || '', matchingArticles[j].title || ''));
      }
    }
    const avgSimilarity = pairs.length > 0 ? pairs.reduce((a, b) => a + b, 0) / pairs.length : 0;
    if (avgSimilarity > 0.7) {
      return 'SINDICACI\u00d3N MASIVA - ' + matchingArticles.length + ' fuentes con titular casi id\u00e9ntico';
    }
  }

  const categories = new Set(matchingArticles.map(a => a.category));
  if (matchingArticles.length >= 3 && categories.size <= 1) {
    return 'SESGO DE FUENTE - Toda la cobertura: ' + [...categories][0];
  }

  if (gdeltMatchCount > 5 && matchingArticles.length < 3) {
    return 'TENDENCIA DIGITAL - Fuerte en GDELT, poca cobertura en medios tradicionales';
  }

  if (matchingArticles.length < 2 && gdeltMatchCount < 3) {
    return 'SIN VERIFICAR - Poca cobertura de medios establecidos';
  }

  if (categories.size > 2) {
    return 'COBERTURA MIXTA - ' + matchingArticles.length + ' medios con diferentes l\u00edneas editoriales';
  }

  if (gdeltMatchCount > 3) {
    return 'COBERTURA AMPLIA - ' + matchingArticles.length + ' RSS + ' + gdeltMatchCount + ' GDELT';
  }

  return 'SIN VERIFICAR - ' + matchingArticles.length + ' medios lo cubren';
}

export async function processTrendingTopics(trending, gdeltData, rssItems, factCheckApiKey) {
  const processed = [];

  for (const topic of trending.slice(0, 15)) {
    const hash = generateHash(topic.theme);
    const existing = getDb().prepare('SELECT id, sources_count FROM topics WHERE hash = ?').get(hash);

    if (existing) {
      updateTopicSources(hash, Math.max(existing.sources_count, topic.uniqueSources), topic.theme);
      continue;
    }

    let factcheck = await searchFactCheck(buildFactCheckQuery(topic.theme), factCheckApiKey);

    if (!factcheck && process.env.GROQ_API_KEY) {
      const extracted = await extractClaim(topic.theme, topic.summary, null, process.env.GROQ_API_KEY);
      if (extracted && extracted.query) {
        factcheck = await searchFactCheck(extracted.query, factCheckApiKey);
      }
      if (!factcheck && extracted && extracted.keywords) {
        for (const kw of extracted.keywords) {
          factcheck = await searchFactCheck(kw, factCheckApiKey);
          if (factcheck) break;
        }
      }
    }

    let riskSignal = assessRisk(topic, factcheck, rssItems, gdeltData);

    if (topic.relatedItems && topic.relatedItems.length >= 2 && process.env.GROQ_API_KEY) {
      try {
        const coherence = await analyzeCoherence(topic.theme, topic.relatedItems.slice(0, 5), process.env.GROQ_API_KEY);
        if (coherence && coherence.contradictions) {
          riskSignal = 'CONTRADICCION - ' + (coherence.contradictionDetails || 'Fuentes se contradicen entre si').slice(0, 100);
        }
        if (coherence && coherence.flaggedClaims && coherence.flaggedClaims.length > 0 && !factcheck) {
          for (const claim of coherence.flaggedClaims.slice(0, 2)) {
            const fc = await searchFactCheck(claim, factCheckApiKey);
            if (fc) { factcheck = fc; break; }
          }
        }
      } catch (e) {}
    }

    const topicData = {
      hash,
      headline: topic.theme,
      summary: topic.summary || 'Trending in ' + topic.uniqueSources + ' sources',
      sourcesCount: topic.uniqueSources,
      sourceNames: [...new Set(topic.relatedItems ? topic.relatedItems.map(i => i.source) : [])].join(', '),
      factcheckVerdict: factcheck ? factcheck.verdict : null,
      factcheckSource: factcheck ? factcheck.source : null,
      factcheckUrl: factcheck ? factcheck.url : null,
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

function detectCountry(headline) {
  const lower = headline.toLowerCase();
  const m = { 'estados unidos':'US','united states':'US','usa':'US','trump':'US','biden':'US','china':'CN','chino':'CN','beijing':'CN','rusia':'RU','russia':'RU','putin':'RU','ukraine':'UA','ucrania':'UA','zelensky':'UA','israel':'IL','gaza':'IL','palestine':'PS','mexico':'MX','m\u00e9xico':'MX','amlo':'MX','sheinbaum':'MX','espa\u00f1a':'ES','spain':'ES','s\u00e1nchez':'ES','venezuela':'VE','maduro':'VE','argentina':'AR','milei':'AR','colombia':'CO','petro':'CO','brasil':'BR','bolsonaro':'BR','lula':'BR','iran':'IR','ir\u00e1n':'IR','uk':'UK','britain':'UK','reino unido':'UK','alemania':'DE','germany':'DE','francia':'FR','france':'FR','india':'IN','cuba':'CU','chile':'CL','peru':'PE','per\u00fa':'PE' };
  for (const [k,v] of Object.entries(m)) { if (lower.includes(k)) return v; }
  return 'global';
}

function categorizeTopic(headline) {
  const l = headline.toLowerCase();
  if (/(elecc|president|gobierno|vote|pol.ti)/i.test(l)) return 'politica';
  if (/(econom|inflaci.n|d.lar|mercado|bolsa)/i.test(l)) return 'economia';
  if (/(salud|virus|covid|hospital|medic)/i.test(l)) return 'salud';
  if (/(guerra|militar|ej.rcito|armas|ataque|bomba|defensa)/i.test(l)) return 'seguridad';
  if (/(clima|terremoto|inundaci.n|hurac.n|desastre|sequ.a)/i.test(l)) return 'medioambiente';
  if (/(f.tbol|mundial|deporte|olimp|tenis|baloncesto)/i.test(l)) return 'deportes';
  if (/(ciencia|investigaci.n|descubrimiento|estudio|tecnolog.a)/i.test(l)) return 'ciencia';
  return 'general';
}
