// Test data for offline development
export const TEST_GDELT_DATA = [
  {
    date: '20260720180000',
    source: 'Reuters',
    url: 'https://reuters.com/test1',
    themes: ['ELECTIONS', 'POLITICS', 'TRUMP'],
    title: 'Trump announces new tariff policy on Chinese goods',
    headline: 'Trump announces new tariff policy on Chinese goods'
  },
  {
    date: '20260720180000',
    source: 'AP',
    url: 'https://ap.com/test1',
    themes: ['ELECTIONS', 'POLITICS', 'TRUMP'],
    title: 'Trump tariff announcement shocks markets',
    headline: 'Trump tariff announcement shocks markets'
  },
  {
    date: '20260720180000',
    source: 'BBC',
    url: 'https://bbc.com/test1',
    themes: ['ECONOMY', 'TRADE', 'CHINA'],
    title: 'Global markets react to US-China trade tensions',
    headline: 'Global markets react to US-China trade tensions'
  },
  {
    date: '20260720180000',
    source: 'CNN',
    url: 'https://cnn.com/test1',
    themes: ['ECONOMY', 'TRADE', 'CHINA'],
    title: 'Trade war escalation: China responds to tariffs',
    headline: 'Trade war escalation: China responds to tariffs'
  },
  {
    date: '20260720180000',
    source: 'AlJazeera',
    url: 'https://aljazeera.com/test1',
    themes: ['MIDDLE_EAST', 'CONFLICT'],
    title: 'Ceasefire negotiations continue in Gaza',
    headline: 'Ceasefire negotiations continue in Gaza'
  },
  {
    date: '20260720180000',
    source: 'DW',
    url: 'https://dw.com/test1',
    themes: ['EUROPE', 'UKRAINE', 'CONFLICT'],
    title: 'Ukraine reports progress on eastern front',
    headline: 'Ukraine reports progress on eastern front'
  },
];

export const TEST_RSS_ITEMS = [
  {
    source: 'BBC World',
    category: 'agencia',
    title: 'Trump announces new tariff policy on Chinese goods',
    link: 'https://bbc.com/news/trump-tariffs',
    pubDate: '2026-07-20T18:00:00Z',
    description: 'US President announces sweeping tariffs on Chinese imports'
  },
  {
    source: 'El País',
    category: 'espanol',
    title: 'Trump anuncia nuevos aranceles a productos chinos',
    link: 'https://elpais.com/trump-aranceles',
    pubDate: '2026-07-20T18:00:00Z',
    description: 'El presidente de EE.UU. anuncia aranceles del 25%'
  },
  {
    source: 'Al Jazeera',
    category: 'agencia',
    title: 'Ceasefire talks in Gaza enter critical phase',
    link: 'https://aljazeera.com/gaza-ceasefire',
    pubDate: '2026-07-20T17:30:00Z',
    description: 'Negotiations continue as humanitarian crisis deepens'
  },
  {
    source: 'DW News',
    category: 'agencia',
    title: 'Zelenskyy calls for more weapons from NATO allies',
    link: 'https://dw.com/ukraine-weapons',
    pubDate: '2026-07-20T17:00:00Z',
    description: 'Ukrainian president addresses NATO summit'
  },
  {
    source: 'The Guardian',
    category: 'generalista',
    title: 'Climate summit: Major nations pledge carbon cuts',
    link: 'https://theguardian.com/climate-summit',
    pubDate: '2026-07-20T16:00:00Z',
    description: 'G20 countries announce new emissions targets'
  },
];

export const TEST_FACTCHECK = {
  verdict: 'misleading',
  source: 'PolitiFact',
  url: 'https://politifact.com/factchecks/trump-tariffs',
  title: 'Trump claims tariffs will create jobs',
  reviewTitle: 'Analysis shows mixed economic impact',
  claimDate: '2026-07-19'
};
