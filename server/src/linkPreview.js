import dns from 'dns/promises';
import net from 'net';

// Fetch Open Graph metadata for an external content link (mod download
// page etc.). Guarded against SSRF: only http/https and only public IPs.

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6000;
const UA = 'AssettoMan/1.0';

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 0 || p[0] >= 224) return true;
    return false;
  }
  const low = ip.toLowerCase();
  if (low === '::1' || low === '::') return true;
  if (/^f[cd]/.test(low)) return true; // fc00::/7
  if (/^fe[89ab]/.test(low)) return true; // fe80::/10 link-local
  if (low.startsWith('::ffff:')) return isPrivateIp(low.slice(7));
  return false;
}

async function assertPublicUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http(s) URLs allowed');
  }
  if (net.isIP(u.hostname)) {
    if (isPrivateIp(u.hostname)) throw new Error('Private address not allowed');
    return u;
  }
  const { address } = await dns.lookup(u.hostname);
  if (isPrivateIp(address)) throw new Error('Private address not allowed');
  return u;
}

function meta(html, key) {
  // og:*/twitter:* via property= or name=
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const m = tag.match(/content=["']([^"']*)["']/i) || tag.match(/content=([^\s>]+)/i);
  return m ? decodeEntities(m[1]).trim() : null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

export async function fetchLinkPreview(rawUrl) {
  await assertPublicUrl(rawUrl);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(rawUrl, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.8' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Re-check the final URL after redirects.
    if (res.url && res.url !== rawUrl) await assertPublicUrl(res.url);

    const reader = res.body?.getReader?.();
    let html = '';
    if (reader) {
      const dec = new TextDecoder();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += dec.decode(value, { stream: true });
        if (received >= MAX_BYTES) { reader.cancel().catch(() => {}); break; }
      }
      html += dec.decode();
    } else {
      html = (await res.text()).slice(0, MAX_BYTES);
    }

    const finalUrl = res.url || rawUrl;
    const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const title = meta(html, 'og:title') || (titleTag ? decodeEntities(titleTag).trim() : null);
    const image = meta(html, 'og:image') || meta(html, 'twitter:image') || meta(html, 'twitter:image:src');
    const description = meta(html, 'og:description') || meta(html, 'description');
    const siteName = meta(html, 'og:site_name');

    const haystack = `${finalUrl} ${title || ''}`;
    const kind = /track|circuit|raceway|speedway|nordschleife|ring\b/i.test(haystack) ? 'track' : 'car';

    return {
      title: title || null,
      image: image ? new URL(image, finalUrl).href : null,
      description: description || null,
      siteName: siteName || null,
      url: finalUrl,
      kind,
    };
  } finally {
    clearTimeout(timer);
  }
}
