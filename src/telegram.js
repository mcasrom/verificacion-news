import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import { generateCard } from './cardgen.js';

const TELEGRAM_API = 'https://api.telegram.org';

export async function publishToChannel(botToken, channelId, topics) {
  if (!botToken || !channelId) {
    console.error('[Telegram] Missing bot token or channel ID');
    return [];
  }

  const published = [];

  for (const topic of topics) {
    try {
      const message = formatCaption(topic);
      let photoBuffer;
      let filename;

      if (topic.image_url) {
        try {
          const imgResp = await fetch(topic.image_url, { signal: AbortSignal.timeout(6000) });
          if (imgResp.ok) {
            photoBuffer = Buffer.from(await imgResp.arrayBuffer());
            filename = 'image.jpg';
          }
        } catch (e) {
          photoBuffer = null;
        }
      }

      if (!photoBuffer) {
        const cardPath = generateCard(topic);
        if (cardPath) {
          photoBuffer = readFileSync(cardPath);
          filename = 'card.png';
        }
      }

      if (!photoBuffer) {
        console.warn('[Telegram] No image for #' + topic.id + ', skip');
        continue;
      }

      const form = new FormData();
      form.append('chat_id', channelId);
      form.append('photo', new Blob([photoBuffer], { type: 'image/png' }), filename);
      form.append('caption', message);
      form.append('parse_mode', 'HTML');

      const resp = await fetch(TELEGRAM_API + '/bot' + botToken + '/sendPhoto', {
        method: 'POST',
        body: form
      });

      if (resp.ok) {
        published.push(topic.id);
        const hl = (topic.improved_headline || topic.headline || '').slice(0, 50);
        console.log('[Telegram] OK: ' + hl + '...');
      } else {
        const err = await resp.json();
        console.error('[Telegram] Error:', err.description);
      }

      await sleep(1500);
    } catch (e) {
      console.error('[Telegram] Error:', e.message);
    }
  }

  return published;
}

function formatCaption(topic) {
  const s = {
    'false': { e: '\uD83D\uDD34', t: 'FALSO' },
    'true': { e: '\uD83D\uDFE2', t: 'VERIFICADO' },
    'misleading': { e: '\uD83D\uDFE1', t: 'ENGA\u00d1OSO' },
    'unverified': { e: '\u26AA', t: 'SIN VERIFICAR' }
  }[topic.factcheck_verdict] || { e: '\u26AA', t: 'SIN VERIFICAR' };

  const headline = (topic.improved_headline || topic.headline || '');
  const summary = (topic.improved_summary || topic.summary || '');
  const safeSummary = cleanSummary(summary, topic.sources_count || 0);

  let msg = s.e + ' <b>' + s.t + '</b>\n\n<b>' + headline + '</b>\n';
  if (safeSummary && safeSummary !== headline) {
    msg += '\n' + safeSummary + '\n';
  }
  if (topic.factcheck_source) {
    msg += '\n\u2705 <b>' + topic.factcheck_source + '</b>';
  }
  if (topic.factcheck_url) {
    msg += '\n\uD83D\uDD17 ' + topic.factcheck_url;
  }
  if (topic.article_link) {
    msg += '\n\uD83D\uDCF0 ' + topic.article_link;
  }
  msg += '\n\n\uD83D\uDCCA <b>' + (topic.sources_count || 1) + ' fuentes</b>';

  const tags = hashtags(topic);
  if (tags) msg += '\n\n' + tags;
  return msg;
}

function cleanSummary(summary, realCount) {
  if (!summary) return '';
  // Remove any reference to inflated source counts
  return summary.replace(/\d[\d,.]* fuentes?/gi, realCount + ' fuentes');
}

function hashtags(topic) {
  const tags = new Set();
  const text = ((topic.improved_headline || topic.headline || '') + ' ' + (topic.improved_summary || topic.summary || '')).toLowerCase();

  const ct = { 'US': '#USA', 'ES': '#Espa\u00f1a', 'UK': '#UK', 'FR': '#Francia', 'DE': '#Alemania',
    'RU': '#Rusia', 'CN': '#China', 'UA': '#Ucrania', 'IL': '#Israel', 'PS': '#Palestina',
    'MX': '#M\u00e9xico', 'AR': '#Argentina', 'CO': '#Colombia', 'VE': '#Venezuela', 'BR': '#Brasil' };
  if (topic.country && ct[topic.country]) tags.add(ct[topic.country]);

  if (text.includes('guerra') || text.includes('militar')) tags.add('#Guerra');
  if (/(eleccion|presidente|gobierno|voto|pol.ti)/i.test(text)) tags.add('#Pol\u00edtica');
  if (/(econom|inflacion|d.lar|mercado)/i.test(text)) tags.add('#Econom\u00eda');
  if (/(salud|virus|covid|hospital)/i.test(text)) tags.add('#Salud');
  if (/(clima|inundacion|terremoto|hurac.n)/i.test(text)) tags.add('#Clima');
  if (/(israel|gaza|palestina|hamas)/i.test(text)) tags.add('#OrienteMedio');

  tags.add('#Verificado');
  return [...tags].slice(0, 5).join(' ');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
