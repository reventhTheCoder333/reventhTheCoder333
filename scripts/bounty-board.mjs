#!/usr/bin/env node
// Renders assets/bounty-board.svg from live GitHub data — nothing hand-written.
//
//   GITHUB_TOKEN=... node scripts/bounty-board.mjs [username]
//
// Without a token it still works, but the contribution count (GraphQL only)
// is left out. The workflow in .github/workflows runs this daily.

import { writeFileSync, mkdirSync } from 'node:fs';

const user = process.argv[2] || process.env.GH_USER || 'reventhTheCoder333';
const token = process.env.GITHUB_TOKEN;
const headers = {
  'User-Agent': 'grand-line-bounty-board',
  Accept: 'application/vnd.github+json',
  ...(token && { Authorization: `Bearer ${token}` }),
};

const rest = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};

const profile = await rest(`/users/${user}`);
const repos = (await rest(`/users/${user}/repos?per_page=100&type=owner`)).filter((r) => !r.fork);

const stars = repos.reduce((n, r) => n + r.stargazers_count, 0);
const forks = repos.reduce((n, r) => n + r.forks_count, 0);

// Language share by bytes across owned, non-fork repos
const bytes = {};
for (const r of repos) {
  for (const [lang, n] of Object.entries(await rest(`/repos/${user}/${r.name}/languages`))) {
    bytes[lang] = (bytes[lang] || 0) + n;
  }
}
const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
const langs = Object.entries(bytes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([name, n]) => ({ name, pct: (n / total) * 100 }));

let contributions = null;
if (token) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: `query($u:String!){user(login:$u){contributionsCollection{contributionCalendar{totalContributions}}}}`,
      variables: { u: user },
    }),
  });
  const json = await res.json();
  contributions = json.data?.user?.contributionsCollection.contributionCalendar.totalContributions ?? null;
}

// --- render ---------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const serif = `font-family="'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif"`;
const sans = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;

const stats = [
  ['Islands charted', repos.length, 'original repositories'],
  ...(contributions !== null ? [['Discoveries', contributions, 'contributions, last year']] : []),
  ['Treasure', stars, 'stars earned'],
  ['Crew', profile.followers, 'followers'],
  ['Fleet', forks, 'forks of my repos'],
];
const palette = ['#C6A15B', '#1B6570', '#D97941', '#4FB3B0', '#E8D6AD'];

const W = 840;
const H = 300;
const colW = 380 / Math.ceil(stats.length / 2) - 4;

const statCells = stats
  .map(([label, value, note], i) => {
    const col = Math.floor(i / 2);
    const row = i % 2;
    const x = 40 + col * (colW + 8);
    const y = 96 + row * 92;
    return `
  <g transform="translate(${x} ${y})">
    <text ${serif} font-size="12" letter-spacing="2.5" fill="#C6A15B">${esc(label.toUpperCase())}</text>
    <text y="40" ${serif} font-size="34" font-weight="600" fill="#E8D6AD">${esc(value.toLocaleString('en-US'))}</text>
    <text y="60" ${sans} font-size="11" fill="#B8AC92">${esc(note)}</text>
  </g>`;
  })
  .join('');

let offset = 0;
const bar = langs
  .map((l, i) => {
    const w = (l.pct / 100) * 340;
    const seg = `<rect x="${460 + offset}" y="108" width="${Math.max(w, 1).toFixed(1)}" height="10" fill="${palette[i]}"/>`;
    offset += w;
    return seg;
  })
  .join('');
const legend = langs
  .map(
    (l, i) => `
  <g transform="translate(460 ${146 + i * 26})">
    <circle cx="6" cy="-4" r="5" fill="${palette[i]}"/>
    <text x="20" ${sans} font-size="13" fill="#E8D6AD">${esc(l.name)}</text>
    <text x="340" ${sans} font-size="13" fill="#B8AC92" text-anchor="end">${l.pct.toFixed(1)}%</text>
  </g>`,
  )
  .join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(user)} GitHub bounty board">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0B2638"/><stop offset="1" stop-color="#071B2B"/>
    </linearGradient>
    <clipPath id="barclip"><rect x="460" y="108" width="340" height="10" rx="5"/></clipPath>
  </defs>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="url(#bg)" stroke="#C6A15B" stroke-opacity=".45"/>
  <rect x="8.5" y="8.5" width="${W - 17}" height="${H - 17}" rx="8" fill="none" stroke="#C6A15B" stroke-opacity=".15" stroke-dasharray="2 4"/>
  <text x="40" y="54" ${serif} font-size="24" font-weight="600" fill="#E8D6AD">Bounty Board</text>
  <text x="${W - 40}" y="54" ${serif} font-size="12" letter-spacing="3" fill="#C6A15B" text-anchor="end">WANTED · ${esc(user.toUpperCase())}</text>
  <path d="M40 70 H${W - 40}" stroke="#C6A15B" stroke-opacity=".3"/>
  <path d="M430 92 V262" stroke="#C6A15B" stroke-opacity=".18"/>
  ${statCells}
  <text x="460" y="96" ${serif} font-size="12" letter-spacing="2.5" fill="#C6A15B">LANGUAGES OF THE SEAS</text>
  <rect x="460" y="108" width="340" height="10" rx="5" fill="#04121E"/>
  <g clip-path="url(#barclip)">${bar}</g>
  ${legend}
  <text x="${W - 40}" y="${H - 18}" ${sans} font-size="10" fill="#B8AC92" fill-opacity=".7" text-anchor="end">Generated from the GitHub API · ${new Date().toISOString().slice(0, 10)}</text>
</svg>
`;

mkdirSync('assets', { recursive: true });
writeFileSync('assets/bounty-board.svg', svg);
console.log(`assets/bounty-board.svg — ${repos.length} repos, ${stars} stars, contributions: ${contributions ?? 'n/a (no token)'}`);
