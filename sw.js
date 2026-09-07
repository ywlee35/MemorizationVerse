/**
 * 새일꾼반 성경암송 — 서비스워커
 * ------------------------------------------------------------
 *  화면(HTML·아이콘)은 설치 시 미리 저장하고,
 *  음성 파일은 한 번 재생한 것부터 기기에 쌓아 둡니다.
 *  → 비행기·지하철에서도 들었던 구절은 그대로 재생됩니다.
 *
 *  SHELL 을 고치면 SHELL_VER 를 올려야 이전 캐시가 정리됩니다.
 *  음성 캐시(AUDIO)는 파일명이 바뀌지 않는 한 그대로 유지합니다.
 */

const SHELL_VER = 'v1';
const SHELL = `mv-shell-${SHELL_VER}`;
const AUDIO = 'mv-audio-v1';
const FONT  = 'mv-font-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // 하나가 실패해도 나머지는 저장되도록 개별 처리
    await Promise.all(SHELL_FILES.map(async (u) => {
      try { await c.add(new Request(u, { cache: 'reload' })); } catch {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, AUDIO, FONT]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

/** 캐시 우선 — 있으면 즉시, 없으면 받아서 저장 */
async function cacheFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {});
  return res;
}

/** 네트워크 우선 — 최신을 받되 오프라인이면 저장본 */
async function networkFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) c.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    const hit = await c.match(req) || await c.match('./index.html') || await c.match('./');
    if (hit) return hit;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 음성 파일: 한 번 받으면 계속 재사용
  if (sameOrigin && /\/Audio\/.+\.mp3$/i.test(url.pathname)) {
    e.respondWith(cacheFirst(req, AUDIO));
    return;
  }

  // 화면: 최신 우선, 오프라인이면 저장본
  if (req.mode === 'navigate' || (sameOrigin && /\.html?$/.test(url.pathname))) {
    e.respondWith(networkFirst(req, SHELL));
    return;
  }

  // 아이콘·manifest
  if (sameOrigin) { e.respondWith(cacheFirst(req, SHELL)); return; }

  // 구글 폰트 (오프라인에서도 서체 유지)
  if (/^https:\/\/fonts\.(googleapis|gstatic)\.com$/.test(url.origin)) {
    e.respondWith(cacheFirst(req, FONT).catch(() => fetch(req)));
  }
});

/** 앱에서 캐시 상태를 물어볼 때 */
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'audio-status') return;
  e.waitUntil((async () => {
    const c = await caches.open(AUDIO);
    const n = (await c.keys()).length;
    e.source?.postMessage({ type: 'audio-status', cached: n });
  })());
});
