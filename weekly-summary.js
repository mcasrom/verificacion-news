import 'dotenv/config';
import { postWeeklySummary } from './src/utils.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL = process.env.TELEGRAM_CHANNEL_ID;

if (!TOKEN || !CHANNEL) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID');
  process.exit(1);
}

await postWeeklySummary(TOKEN, CHANNEL);
console.log('[Weekly] Done');
process.exit(0);
