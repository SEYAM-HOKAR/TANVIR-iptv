const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;
const HOST = '0.0.0.0';
const STREAMS_DIR = path.join(__dirname, 'streams');

function getCategoryFromChannel(name, tvgId, country) {
  const n = name.toLowerCase();
  const id = (tvgId || '').toLowerCase();

  if (/sport|cricket|football|soccer|espn|star sport|ten sport|willow|ptv sport|geo sport|dd sport|btv sport|khel|fox sport|bein|laliga|nfl|nba|golf|racing|f1/i.test(n + id)) return 'Sports';
  if (/news|cnn|bbc news|sky news|geo news|aaj|abb takk|92news|channel24|channel 24|btv news|dbc|rtv news|somoy|independent tv|jamuna|ekhon/i.test(n + id)) return 'News';
  if (/kids|cartoon|disney|nick|pogo|baby|cbeebies|toonami|hungama|nickelodeon/i.test(n + id)) return 'Kids';
  if (/music|mtv|vh1|hits|channel v|9xm|b4u music|9x|tashan|jalwa|ishara|zing|music asia|9x jhakaas|sonic|song/i.test(n + id)) return 'Music';
  if (/movie|cinema|film|star movies|zee cinema|sony max|hbo|zee action|romedy|epic|&pictures|afl|premiere|plex movies/i.test(n + id)) return 'Movies';
  if (/islamic|quran|peace tv|faith|iqra|god|huda|madani|noor|spiritua|buddhist|religious|god|pray/i.test(n + id)) return 'Religious';
  if (/documentary|national geo|discovery|history|animal planet|nat geo|curiosity|dw|france24|nhk/i.test(n + id)) return 'Documentary';
  if (/cook|food|lifestyle|travel|fashion/i.test(n + id)) return 'Lifestyle';

  if (country === 'bd' || id.includes('.bd')) return 'Bangla';
  if (country === 'in' || id.includes('.in')) return 'Hindi';
  if (country === 'pk' || id.includes('.pk')) return 'Pakistani';
  if (country === 'sa' || country === 'ae' || id.includes('.sa') || id.includes('.ae')) return 'Arabic';
  if (country === 'tr' || id.includes('.tr')) return 'Turkish';
  if (country === 'us' || id.includes('.us')) return 'English';
  if (country === 'gb' || id.includes('.gb')) return 'English';
  if (country === 'fr' || id.includes('.fr')) return 'French';
  if (country === 'de' || id.includes('.de')) return 'German';
  if (country === 'it' || id.includes('.it')) return 'Italian';
  if (country === 'kr' || id.includes('.kr')) return 'Korean';
  if (country === 'jp' || id.includes('.jp')) return 'Japanese';
  if (country === 'ar' || id.includes('.ar')) return 'Spanish';
  if (country === 'br' || id.includes('.br')) return 'Portuguese';

  return 'General';
}

function parseM3U(content, filename, limit) {
  const channels = [];
  const country = path.basename(filename, '.m3u').split('_')[0].toLowerCase();
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (limit && channels.length >= limit) break;
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF')) continue;

    let urlLine = '';
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j].trim();
      if (next.startsWith('#EXTVLCOPT') || next.startsWith('#KODIPROP')) { j++; continue; }
      urlLine = next;
      break;
    }

    if (!urlLine || urlLine.startsWith('#') || !urlLine.startsWith('http')) continue;

    const nameMatch = line.match(/,(.+)$/);
    const logoMatch = line.match(/tvg-logo="([^"]+)"/);
    const tvgIdMatch = line.match(/tvg-id="([^"]+)"/);

    const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
    if (name === 'Unknown' || name === '') continue;

    const tvgId = tvgIdMatch ? tvgIdMatch[1] : '';
    const logo = logoMatch && logoMatch[1] ? logoMatch[1] : null;
    const category = getCategoryFromChannel(name, tvgId, country);

    channels.push({ name, url: urlLine, logo, categories: [category], country: country.toUpperCase() });
  }

  return channels;
}

function loadAllChannels() {
  const priorityFiles = [
    { file: 'bd.m3u', limit: null },
    { file: 'pk.m3u', limit: null },
    { file: 'sa.m3u', limit: null },
    { file: 'ae.m3u', limit: null },
    { file: 'in.m3u', limit: 150 },
    { file: 'in_doordarshan.m3u', limit: 30 },
    { file: 'in_pishow.m3u', limit: 50 },
    { file: 'in_tango.m3u', limit: 40 },
    { file: 'tr.m3u', limit: 80 },
    { file: 'kr.m3u', limit: null },
    { file: 'my.m3u', limit: null },
    { file: 'us.m3u', limit: 100 },
    { file: 'us_abcnews.m3u', limit: 20 },
    { file: 'us_cbsn.m3u', limit: 20 },
    { file: 'us_pbs.m3u', limit: 20 },
    { file: 'de.m3u', limit: 80 },
    { file: 'fr.m3u', limit: 60 },
    { file: 'it.m3u', limit: 60 },
    { file: 'ar.m3u', limit: 60 },
    { file: 'jp.m3u', limit: null },
  ];

  const allChannels = [];
  const seenUrls = new Set();

  for (const { file, limit } of priorityFiles) {
    const filePath = path.join(STREAMS_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const channels = parseM3U(content, file, limit);
      for (const ch of channels) {
        if (!seenUrls.has(ch.url)) {
          seenUrls.add(ch.url);
          allChannels.push(ch);
        }
        if (allChannels.length >= 1200) break;
      }
    } catch (e) {}
    if (allChannels.length >= 1200) break;
  }

  console.log(`Total channels loaded: ${allChannels.length}`);
  return allChannels;
}

let channelsCache = null;

function getChannels() {
  if (!channelsCache) {
    console.log('Loading channels...');
    channelsCache = loadAllChannels();
  }
  return channelsCache;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/api/channels') {
    const channels = getChannels();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(channels));
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end('Error loading page');
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  getChannels();
});
