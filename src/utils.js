import fetch from 'node-fetch';
import { getDb } from './db.js';

const TELEGRAM_API = 'https://api.telegram.org';

export async function pinWelcomeMessage(botToken, channelId) {
  const msg = '\uD83D\uDCE1 \u00bfQu\u00e9 es NewsRadar Verifica?\n\n'
    + 'Canal automatizado de verificación de noticias. Cada hora analizamos m\u00e1s de 13.000 fuentes globales (GDELT + BBC, Al Jazeera, France24, DW) y cruzamos con Google Fact Check API para detectar desinformaci\u00f3n.\n\n'
    + '\uD83D\uDFE2 \u2705 VERIFICADO \u2014 Confirmado por fuentes de fact-checking\n'
    + '\uD83D\uDFE1 \ud83d\udd35 ENGA\u00d1OSO \u2014 Contiene informaci\u00f3n engañosa\n'
    + '\uD83D\uDD34 \u274C FALSO \u2014 Desmentido por verificadores\n'
    + '\u26AA \u274C SIN VERIFICAR \u2014 No tenemos verificaci\u00f3n externa a\u00fan\n\n'
    + 'Sin IA en decisiones de veracidad. Solo cruce mec\u00e1nico de fuentes y fact-checkers.\n'
    + 'Fuentes: BBC, Al Jazeera, France24, DW, AFP Fact Check, Google Fact Check API.';

  try {
    const resp = await fetch(TELEGRAM_API + '/bot' + botToken + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: msg,
        parse_mode: 'HTML',
        disable_notification: true
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      const msgId = data.result.message_id;
      // Pin it
      await fetch(TELEGRAM_API + '/bot' + botToken + '/pinChatMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channelId,
          message_id: msgId,
          disable_notification: true
        })
      });
      console.log('[Pin] Welcome message pinned');
    } else {
      const err = await resp.json();
      console.error('[Pin] Error:', err.description);
    }
  } catch (e) {
    console.error('[Pin] Error:', e.message);
  }
}

export async function postWeeklySummary(botToken, channelId) {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const topics = db.prepare(`
    SELECT * FROM topics
    WHERE created_at >= ? AND published_telegram = 1
    ORDER BY trending_score DESC
  `).all(weekAgo);

  if (topics.length === 0) {
    console.log('[Weekly] No topics this week');
    return;
  }

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN factcheck_verdict = 'false' THEN 1 ELSE 0 END) as false_count,
      SUM(CASE WHEN factcheck_verdict = 'true' THEN 1 ELSE 0 END) as true_count
    FROM topics WHERE created_at >= ? AND published_telegram = 1
  `).get(weekAgo);

  let msg = '\uD83D\uDCCA <b>Resumen semanal NewsRadar</b>\n\n'
    + 'T\u00f3picos verificados esta semana: <b>' + (stats.total || 0) + '</b>\n'
    + '\uD83D\uDD34 Falsos: <b>' + (stats.false_count || 0) + '</b>\n'
    + '\uD83D\uDFE2 Verificados: <b>' + (stats.true_count || 0) + '</b>\n\n'
    + '<b>Top verificaciones:</b>\n\n';

  const top5 = topics.slice(0, 5);
  for (const t of top5) {
    const icons = { 'false': '\uD83D\uDD34', 'true': '\uD83D\uDFE2', 'misleading': '\uD83D\uDFE1', 'unverified': '\u26AA' };
    const icon = icons[t.factcheck_verdict] || '\u26AA';
    const headline = (t.improved_headline || t.headline || '').slice(0, 80);
    msg += icon + ' <b>' + headline + '</b>\n';
    if (t.factcheck_source) msg += '   \u2705 ' + t.factcheck_source + '\n';
    msg += '   \uD83D\uDCCA ' + (t.sources_count || 1) + ' fuentes\n\n';
  }

  msg += '\n<i>@newsradarverifica</i>';

  try {
    const resp = await fetch(TELEGRAM_API + '/bot' + botToken + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: msg,
        parse_mode: 'HTML',
        disable_notification: true
      })
    });

    if (resp.ok) {
      console.log('[Weekly] Summary posted');
    } else {
      const err = await resp.json();
      console.error('[Weekly] Error:', err.description);
    }
  } catch (e) {
    console.error('[Weekly] Error:', e.message);
  }
}
