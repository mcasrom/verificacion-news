import fetch from 'node-fetch';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';

function buildPrompt(topic) {
  const fcSource = topic.factcheckSource ? 'FUENTE DE VERIFICACI\u00d3N: ' + topic.factcheckSource : '';
  const realSources = 'N\u00daMERO DE FUENTES REAL: ' + (topic.sourceCount || 1);

  return [{
    role: 'system',
    content: 'Eres un asistente de MEJORA de contenido para un canal de verificaci\u00f3n de noticias en Telegram. NO decides verdad. Debes devolver SOLO JSON v\u00e1lido. Es OBLIGATORIO usar los datos exactos que se te proporcionan.'
  }, {
    role: 'user',
    content: 'Datos del post:\n'
      + 'T\u00cdTULO ORIGINAL: ' + (topic.headline || '') + '\n'
      + 'DESCRIPCI\u00d3N: ' + (topic.summary || '') + '\n'
      + 'VEREDICTO: ' + (topic.riskSignal || 'SIN VERIFICAR') + '\n'
      + (fcSource ? fcSource + '\n' : '')
      + realSources + '\n'
      + 'PA\u00cdS: ' + (topic.country || 'global') + '\n'
      + 'CATEGOR\u00cdA: ' + (topic.topicCategory || 'general') + '\n\n'
      + 'INSTRUCCIONES ESTRICTAS:\n'
      + '- NO cambiar el significado del t\u00edtulo\n'
      + '- NO a\u00f1adir opiniones\n'
      + '- USA EXACTAMENTE el n\u00famero de fuentes proporcionado (' + (topic.sourceCount || 1) + ') en el summary si lo mencionas\n'
      + '- NO inventes cifras, fechas, ni datos que no est\u00e9n aqu\u00ed\n'
      + '- Mejorar redacci\u00f3n para claridad\n'
      + '- A\u00f1adir 1 emoji relevante\n'
      + '- Devolver SOLO JSON: { "improvedHeadline": "...", "improvedSummary": "...", "suggestedEmoji": "...", "engagementAngle": "..." }\n'
      + '- MAX 280 chars improvedHeadline\n'
      + '- MAX 200 chars improvedSummary'
  }];
}

export async function improveContent(topic, apiKey) {
  if (!apiKey) return null;

  try {
    const response = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: buildPrompt(topic),
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[Groq] API error: ' + response.status);
      return null;
    }

    const data = await response.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Groq] No JSON: ' + text.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      improvedHeadline: (parsed.improvedHeadline || topic.headline || '').slice(0, 280),
      improvedSummary: (parsed.improvedSummary || topic.summary || '').slice(0, 200),
      suggestedEmoji: parsed.suggestedEmoji || '',
      engagementAngle: parsed.engagementAngle || ''
    };
  } catch (e) {
    console.error('[Groq] Error:', e.message);
    return null;
  }
}

export async function analyzeCoherence(headline, sourceHeadlines, apiKey) {
  if (!apiKey || !sourceHeadlines || sourceHeadlines.length < 2) return null;

  const prompt = [{
    role: 'system',
    content: 'Eres un analizador de cobertura medi\u00e1tica. NO decides verdad. Identificas diferencias de enfoque entre fuentes.'
  }, {
    role: 'user',
    content: 'Tema: ' + headline + '\n\nFuentes:\n'
      + sourceHeadlines.map((h, i) => (i + 1) + '. [' + h.source + '] ' + h.title).join('\n')
      + '\n\nAnaliza:\n'
      + '1. \u00bfHay contradicciones entre fuentes?\n'
      + '2. \u00bfUsan distinto lenguaje emocional?\n'
      + '3. \u00bfOmite alguna fuente informaci\u00f3n clave?\n'
      + '4. \u00bfHay sesgo de marco (framing) evidente?\n\n'
      + 'Devuelve SOLO JSON: { contradictions: boolean, framingDiff: ..., omission: ..., summary: ..., coherenceScore: 1-10 }\n'
      + 'coherenceScore 10 = todas las fuentes cuentan lo mismo. 1 = total contradicci\u00f3n.'
  }];

  try {
    const resp = await fetch(GROQ_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: prompt, temperature: 0.2, max_tokens: 400 })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return null;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch (e) {
    console.error('[Coherence] Error:', e.message);
    return null;
  }
}
