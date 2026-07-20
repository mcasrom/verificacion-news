import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.join(__dirname, '..', 'cards');

const VERDICT_STYLES = {
  'false': { color: '#e94560', label: 'FALSO' },
  'true': { color: '#2ecc71', label: 'VERIFICADO' },
  'misleading': { color: '#f39c12', label: 'ENGA\u00d1OSO' },
  'unverified': { color: '#888888', label: 'SIN VERIFICAR' }
};

export function generateCard(topic) {
  if (!fs.existsSync(CARDS_DIR)) {
    fs.mkdirSync(CARDS_DIR, { recursive: true });
  }

  const style = VERDICT_STYLES[topic.factcheck_verdict] || VERDICT_STYLES.unverified;
  const headline = (topic.improved_headline || topic.headline || 'Noticia').slice(0, 100);
  const sources = topic.sources_count || 0;

  const esc = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const headlineLines = wrapText(esc(headline), 30);
  const tspans = headlineLines.map((line, i) =>
    '    <tspan x="40" dy="' + (i === 0 ? '0' : '38') + '">' + line + '</tspan>'
  ).join('\n');

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">',
    '  <defs>',
    '    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
    '      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />',
    '      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />',
    '    </linearGradient>',
    '  </defs>',
    '  <rect width="800" height="450" fill="url(#bg)" rx="20"/>',
    '  <rect width="800" height="6" fill="' + style.color + '" rx="3"/>',
    '  <rect x="40" y="30" width="130" height="30" rx="15" fill="' + style.color + '22" stroke="' + style.color + '" stroke-width="1.5"/>',
    '  <text x="105" y="50" fill="' + style.color + '" font-family="Arial,sans-serif" font-size="13" font-weight="bold" text-anchor="middle">' + style.label + '</text>',
    '  <text x="760" y="50" fill="#666" font-family="Arial,sans-serif" font-size="13" text-anchor="end">' + sources + ' fuentes</text>',
    '  <text x="40" y="85" fill="#e94560" font-family="Arial,sans-serif" font-size="11" font-weight="bold" letter-spacing="2">NEWSRADAR VERIFICA</text>',
    '  <text x="40" y="200" fill="#ffffff" font-family="Arial,sans-serif" font-size="28" font-weight="bold">',
    tspans,
    '  </text>',
    '  <line x1="40" y1="370" x2="760" y2="370" stroke="#2a2a4a" stroke-width="1"/>',
    '  <text x="40" y="410" fill="#555" font-family="Arial,sans-serif" font-size="13">@newsradarverifica</text>',
    '  <text x="760" y="410" fill="#555" font-family="Arial,sans-serif" font-size="13" text-anchor="end">#Verificado</text>',
    '</svg>'
  ].join('\n');

  const svgPath = path.join(CARDS_DIR, 'card_' + topic.id + '.svg');
  const pngPath = path.join(CARDS_DIR, 'card_' + topic.id + '.png');

  fs.writeFileSync(svgPath, svg, 'utf-8');

  try {
    execSync('rsvg-convert ' + svgPath + ' -o ' + pngPath + ' -w 800 -h 450', {
      stdio: 'pipe',
      timeout: 10000
    });
    return pngPath;
  } catch (e) {
    console.error('[Card] rsvg-convert failed:', e.message);
    return null;
  }
}

function wrapText(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const lines = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      lines.push(remaining);
      break;
    }
    const breakAt = remaining.lastIndexOf(' ', maxChars);
    if (breakAt === -1) {
      lines.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    } else {
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt + 1);
    }
  }
  return lines;
}
