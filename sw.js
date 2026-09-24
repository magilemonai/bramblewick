// Bramblewick service worker. Scope ./ (works under the /bramblewick/ sub-path; every URL is relative).
// Cache-first with a background refresh, one cache per VERSION; older versions are deleted on activate.
// Bump VERSION on every deploy. On localhost it is network-first so dev edits always show.
// 1.0 (/v1/) and tools/ are never intercepted.
const VERSION = '2.0.0';
const CACHE = `bramblewick-${VERSION}`;
const FONT_CACHE = `bramblewick-fonts-${VERSION}`;
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

const SHELL = [
  './', 'index.html', 'styles.css', 'styles-meta.css', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'src/main.js', 'src/pixel.js', 'src/audio.js',
  'src/art/chars_a.js', 'src/art/chars_b.js', 'src/art/chars_c.js', 'src/art/plants.js', 'src/art/icons.js', 'src/art/icons2.js', 'src/art/scenery.js',
  'src/data/cards.js', 'src/data/enemies.js', 'src/data/events.js', 'src/data/keepsakes.js', 'src/data/plants.js', 'src/data/preserves.js',
  'src/data/story.js', 'src/data/characters.js', 'src/data/modes.js', 'src/data/tutorial.js',
  'src/engine/combat.js', 'src/engine/content.js', 'src/engine/map.js', 'src/engine/meta.js', 'src/engine/modes.js', 'src/engine/rewards.js',
  'src/engine/rng.js', 'src/engine/runapi.js', 'src/engine/state.js', 'src/engine/storage.js',
  'src/ui/cardview.js', 'src/ui/combatview.js', 'src/ui/dom.js', 'src/ui/frames.js', 'src/ui/hud.js', 'src/ui/tutorial.js',
  'src/ui/screens/deps.js', 'src/ui/screens/title.js', 'src/ui/screens/select.js', 'src/ui/screens/story.js', 'src/ui/screens/map.js',
  'src/ui/screens/combat.js', 'src/ui/screens/rewards.js', 'src/ui/screens/events.js', 'src/ui/screens/end.js',
  'src/ui/screens/compendium.js', 'src/ui/screens/settings.js', 'src/ui/screens/daily.js',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One by one so a file that doesn't exist yet never fails the whole install.
    await Promise.all(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([CACHE, FONT_CACHE]);
    for (const k of await caches.keys()) if (k.startsWith('bramblewick-') && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const scopePath = new URL(self.registration.scope).pathname;
const inScope = url => url.origin === self.location.origin && url.pathname.startsWith(scopePath);
const excluded = url => { const rel = url.pathname.slice(scopePath.length); return rel.startsWith('v1/') || rel === 'v1' || rel.startsWith('tools/'); };

async function refresh(req, cacheName) {
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) {
    const cache = await caches.open(cacheName);
    await cache.put(req, res.clone());
  }
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: cache-first, so the pixel font works offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.match(req).then(hit => hit || refresh(req, FONT_CACHE)).catch(() => caches.match(req)));
    return;
  }
  if (!inScope(url) || excluded(url)) return;

  const isNav = req.mode === 'navigate';
  const lookup = () => (isNav ? caches.match('index.html', { ignoreSearch: true }).then(r => r || caches.match('./')) : caches.match(req, { ignoreSearch: true }));

  if (DEV) {
    event.respondWith(refresh(req, CACHE).catch(() => lookup()));
    return;
  }
  event.respondWith((async () => {
    const hit = await lookup();
    const net = refresh(isNav ? new Request('index.html') : req, CACHE);
    if (hit) { event.waitUntil(net.catch(() => {})); return hit; }
    try { return await net; } catch { return (await lookup()) || Response.error(); }
  })());
});
