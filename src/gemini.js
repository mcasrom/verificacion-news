import fetch from 'node-fetch';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';

function buildPrompt(topic) {
  const fcSource = topic.factcheckSource ? 'FUENTE DE VERIFICACION: ' + topic.factcheckSource : '';
  const realSources = 'NUMERO DE FUENTES REAL: ' + (topic.sourceCount || 1);

  return [{
    role: 'system',
    content: 'Eres un asistente de MEJORA de contenido para un canal de verificacion de noticias en Telegram. NO decides verdad. Debes devolver SOLO JSON valido. Es OBLIGATORIO usar los datos exactos que se te proporcionan.'
  }, {
    role: 'user',
    content: 'Datos del post:\n'
      + 'TITULO ORIGINAL: ' + (topic.headline || '') + '\n'
      + 'DESCRIPCION: ' + (topic.summary || '') + '\n'
      + 'VEREDICTO: ' + (topic.riskSignal || 'SIN VERIFICAR') + '\n'
      + (fcSource ? fcSource + '\n' : '')
      + realSources + '\n'
      + 'PAIS: ' + (topic.country || 'global') + '\n'
      + 'CATEGORIA: ' + (topic.topicCategory || 'general') + '\n\n'
      + 'INSTRUCCIONES ESTRICTAS:\n'
      + '- NO cambiar el significado del titulo\n'
      + '- NO anadir opiniones\n'
      + '- USA EXACTAMENTE el numero de fuentes proporcionado (' + (topic.sourceCount || 1) + ') en el summary si lo mencionas\n'
      + '- NO inventes cifras, fechas, ni datos que no esten aqui\n'
      + '- Mejorar redaccion para claridad\n'
      + '- Anadir 1 emoji relevante\n'
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

export async function extractClaim(headline, summary, sourcesInfo, apiKey) {
  if (!apiKey || !headline) return null;

  const prompt = [{
    role: 'system',
    content: 'Eres un extractor de afirmaciones factuales para buscar en Google Fact Check. Extrae la afirmacion principal verificable (claim) del titular de una noticia.'
  }, {
    role: 'user',
    content: 'TITULAR: ' + headline + '\n'
      + (summary ? 'RESUMEN: ' + summary + '\n' : '')
      + (sourcesInfo ? 'FUENTES: ' + sourcesInfo + '\n' : '')
      + '\nExtrae la afirmacion factual principal que podria ser verificada por un fact-checker.\n'
      + 'Ejemplo: titular "Trump says US soldiers killed in Iran" -> claim: "US soldiers killed in Iran 2026"\n'
      + 'Devuelve SOLO JSON: { "claim": "...", "query": "...", "keywords": ["..."] }\n'
      + '- "claim": afirmacion clara y verificable\n'
      + '- "query": consulta optimizada para Google Fact Check (max 100 chars)\n'
      + '- "keywords": 3-5 palabras clave para busqueda alternativa'
  }];

  try {
    const resp = await fetch(GROQ_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: prompt, temperature: 0.1, max_tokens: 300 })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return null;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch (e) {
    return null;
  }
}

export async function analyzeCoherence(headline, sourceHeadlines, apiKey) {
  if (!apiKey || !sourceHeadlines || sourceHeadlines.length < 2) return null;

  const prompt = [{
    role: 'system',
    content: 'Eres un analizador de cobertura mediatica. Detectas contradicciones FACTUALES entre fuentes. Compara cifras, fechas, nombres y afirmaciones concretas. Si dos fuentes dicen cosas distintas sobre el mismo hecho, marcalo como contradiccion.'
  }, {
    role: 'user',
    content: 'Tema: ' + headline + '\n\nFuentes:\n'
      + sourceHeadlines.map((h, i) => (i + 1) + '. [' + h.source + '] ' + h.title).join('\n')
      + '\n\nINSTRUCCIONES ESTRICTAS:\n'
      + '1. Compara cada par de fuentes buscando contradicciones FACTUALES (no editoriales)\n'
      + '2. Seniala si una fuente afirma X y otra afirma lo contrario\n'
      + '3. Indica si alguna fuente omite informacion que las otras si cubren\n'
      + '4. Detecta uso de lenguaje emocional vs neutral\n\n'
      + 'Devuelve SOLO JSON: {\n'
      + '  "contradictions": boolean,\n'
      + '  "contradictionDetails": "explicacion de la contradiccion o null",\n'
      + '  "framingDiff": "diferencia de enfoque entre fuentes",\n'
      + '  "omission": "que omite alguna fuente respecto a otras o null",\n'
      + '  "emotionalLang": "fuente mas emocional vs mas neutral",\n'
      + '  "summary": "resumen del analisis",\n'
      + '  "coherenceScore": 1-10,\n'
      + '  "flaggedClaims": ["lista de afirmaciones que requieren verificacion"]\n'
      + '}\n'
      + 'coherenceScore 10 = todas las fuentes cuentan exactamente lo mismo.\n'
      + 'flaggedClaims = claims concretos que un fact-checker podria verificar.'
  }];

  try {
    const resp = await fetch(GROQ_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: prompt, temperature: 0.2, max_tokens: 500 })
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
