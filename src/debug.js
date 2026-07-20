import { fetchRSS, detectRSSTrending } from './sources/rss.js';

const rssItems = await fetchRSS();
console.log(`RSS items: ${rssItems.length}`);

console.log('\nTrending topics:');
const trending = detectRSSTrending(rssItems);
console.log(`Found: ${trending.length}`);
trending.forEach(t => {
  console.log(`- "${t.theme}" (${t.count} mentions, score: ${t.score})`);
  if (t.relatedItems) {
    t.relatedItems.slice(0, 2).forEach(i => console.log(`    → ${i.source}: ${i.title}`));
  }
});
