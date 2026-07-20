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
      
      const response = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channelId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });
      
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
    'false': '🔴 FALSO',
    'true': '🟢 VERIFICADO',
    'misleading': '🟡 ENGAÑOSO',
    'unverified': '⚪ SIN VERIFICAR'
  };
  
  const status = topic.factcheck_verdict 
    ? verdictEmoji[topic.factcheck_verdict] || '⚪ SIN VERIFICAR'
    : topic.risk_signal || '⚪ SIN VERIFICAR';
  
  let msg = `📰 <b>${topic.headline}</b>\n\n`;
  msg += `Estado: ${status}\n`;
  
  if (topic.factcheck_source) {
    msg += `Fuente verificación: ${topic.factcheck_source}\n`;
  }
  
  if (topic.factcheck_url) {
    msg += `🔗 ${topic.factcheck_url}\n`;
  }
  
  msg += `\n📊 ${topic.sources_count} medios cubren este tema`;
  
  if (topic.topic_category) {
    msg += ` | Categoría: ${topic.topic_category}`;
  }
  
  if (topic.country && topic.country !== 'global') {
    msg += ` | País: ${topic.country}`;
  }
  
  msg += `\n\n<i>Verificado automáticamente - Fuentes: FactCheck API + GDELT + RSS</i>`;
  
  return msg;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
