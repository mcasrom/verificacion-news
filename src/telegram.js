import fetch from 'node-fetch';

const TELEGRAM_API = 'https://api.telegram.org';

export async function publishToChannel(botToken, channelId, topics) {
  if (!botToken || !channelId) {
    console.error('[Telegram] Missing bot token or channel ID');
    return [];
  }
  
  const published = [];
  
  for (const topic of topics) {
    try {
      const message = formatMessage(topic);
      
      let response;
      
      if (topic.image_url) {
        response = await fetch(`${TELEGRAM_API}/bot${botToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channelId,
            photo: topic.image_url,
            caption: message,
            parse_mode: 'HTML'
          })
        });
      } else {
        response = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channelId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: false
          })
        });
      }
      
      if (response.ok) {
        published.push(topic.id);
        console.log(`[Telegram] Published: ${topic.headline.slice(0, 50)}...`);
      } else {
        const err = await response.json();
        console.error(`[Telegram] Error:`, err.description);
      }
      
      await sleep(1000);
      
    } catch (e) {
      console.error(`[Telegram] Error publishing:`, e.message);
    }
  }
  
  return published;
}

function formatMessage(topic) {
  const verdictEmoji = {
    'false': '🔴',
    'true': '🟢',
    'misleading': '🟡',
    'unverified': '⚪'
  };
  
  const verdictText = {
    'false': 'FALSO',
    'true': 'VERIFICADO',
    'misleading': 'ENGAÑOSO',
    'unverified': 'SIN VERIFICAR'
  };
  
  const emoji = verdictEmoji[topic.factcheck_verdict] || '⚪';
  const verdict = verdictText[topic.factcheck_verdict] || 'SIN VERIFICAR';
  
  let msg = `\n┌─────────────────────────────┐\n`;
  msg += `│  ${emoji} <b>${verdict}</b>\n`;
  msg += `└─────────────────────────────┘\n\n`;
  
  msg += `<b>${topic.headline}</b>\n\n`;
  
  if (topic.summary && topic.summary !== topic.headline) {
    msg += `📝 <i>${topic.summary.slice(0, 180)}</i>\n\n`;
  }
  
  if (topic.factcheck_source) {
    msg += `✅ Verificado por: <b>${topic.factcheck_source}</b>\n`;
  }
  
  if (topic.factcheck_url) {
    msg += `🔗 Verificación: ${topic.factcheck_url}\n`;
  }
  
  if (topic.article_link) {
    msg += `📰 Leer noticia: ${topic.article_link}\n`;
  }
  
  msg += `\n┌─────────────────────────────┐\n`;
  msg += `│  📊 <b>${topic.sources_count} fuentes</b>`;
  
  if (topic.source_names) {
    msg += ` │ ${topic.source_names.split(',').slice(0, 3).join(', ')}`;
  }
  
  msg += `\n└─────────────────────────────┘\n`;
  
  const hashtags = generateHashtags(topic);
  if (hashtags) {
    msg += `\n${hashtags}`;
  }
  
  msg += `\n\n<i>@newsradarverifica</i>`;
  
  return msg;
}

function generateHashtags(topic) {
  const tags = new Set();
  
  if (topic.country && topic.country !== 'global') {
    const countryTags = {
      'US': '#USA', 'ES': '#España', 'UK': '#UK', 'FR': '#Francia',
      'DE': '#Alemania', 'IT': '#Italia', 'RU': '#Rusia', 'CN': '#China',
      'UA': '#Ucrania', 'IL': '#Israel', 'PS': '#Palestina', 'MX': '#México',
      'AR': '#Argentina', 'CO': '#Colombia', 'VE': '#Venezuela', 'BR': '#Brasil'
    };
    if (countryTags[topic.country]) tags.add(countryTags[topic.country]);
  }
  
  const headline = (topic.headline || '').toLowerCase();
  
  if (headline.includes('trump') || headline.includes('eeuu') || headline.includes('united states')) tags.add('#Trump');
  if (headline.includes('guerra') || headline.includes('war') || headline.includes('militar')) tags.add('#Guerra');
  if (headline.includes('elecc') || headline.includes('president') || headline.includes('gobierno')) tags.add('#Política');
  if (headline.includes('econom') || headline.includes('mercado') || headline.includes('dólar')) tags.add('#Economía');
  if (headline.includes('salud') || headline.includes('virus') || headline.includes('covid')) tags.add('#Salud');
  if (headline.includes('clima') || headline.includes('climate')) tags.add('#Clima');
  if (headline.includes('fútbol') || headline.includes('mundial') || headline.includes('world cup')) tags.add('#Fútbol');
  if (headline.includes('irán') || headline.includes('iran')) tags.add('#Irán');
  if (headline.includes('israel') || headline.includes('gaza') || headline.includes('palestina')) tags.add('#OrienteMedio');
  
  if (topic.topic_category === 'politica') tags.add('#Política');
  if (topic.topic_category === 'economia') tags.add('#Economía');
  if (topic.topic_category === 'salud') tags.add('#Salud');
  if (topic.topic_category === 'seguridad') tags.add('#Seguridad');
  
  tags.add('#Verificado');
  
  return [...tags].slice(0, 6).join(' ');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
