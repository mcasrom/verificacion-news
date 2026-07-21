import fetch from 'node-fetch';

const FACT_CHECK_API = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';

export async function searchFactCheck(query, apiKey) {
  if (!apiKey) {
    console.error('[FactCheck] No API key provided');
    return null;
  }
  
  try {
    const params = new URLSearchParams({
      key: apiKey,
      query: query.slice(0, 200),
      languageCode: 'en',
      pageSize: '5'
    });
    
    const response = await fetch(`${FACT_CHECK_API}?${params}`);
    
    if (!response.ok) {
      console.error(`[FactCheck] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.claims || data.claims.length === 0) {
      return null;
    }
    
    const claim = data.claims[0];
    const review = claim.claimReview?.[0];
    
    if (!review) return null;
    
    return {
      verdict: mapRating(review.textualRating),
      source: review.publisher?.name || 'Unknown',
      url: review.url || '',
      title: claim.text || '',
      reviewTitle: review.title || '',
      claimDate: claim.claimDate || claim.publishDate
    };
    
  } catch (e) {
    console.error('[FactCheck] Error:', e.message);
    return null;
  }
}

function mapRating(rating) {
  if (!rating) return 'unverified';
  
  const lower = rating.toLowerCase();
  
  if (lower.includes('falso') || lower.includes('false') || lower.includes('fake') || lower.includes('pinocchio') || lower.includes('unfounded') || lower.includes('hoax') || lower.includes('no evidence') || lower.includes('baseless') || lower.includes('not true') || lower.includes('incorrect')) {
    return 'false';
  }
  if (lower.includes('verdadero') || lower.includes('true') || lower.includes('correct') || lower.includes('confirmed')) {
    return 'true';
  }
  if (lower.includes('engañoso') || lower.includes('misleading') || lower.includes('half') || lower.includes('mostly')) {
    return 'misleading';
  }
  
  return 'unverified';
}

export function buildFactCheckQuery(headline) {
  return headline
    .replace(/[^\w\sáéíóúñ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
