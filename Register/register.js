// Smaran license registration and live preview engine.
import {
  ALL_SERVICES,
  SERVICE_NAMES,
  buildPayload,
  embedBits,
  encodeContainer,
  extractBits,
  decodeContainer,
  payloadBytes,
} from './license-core.js';

/** The public key bundled in the app (src/shared/license/publicKey.ts). */
const APP_PUBLIC_KEY = 'ETy6dgHw3Qhi1XK2ihXl6buklNrdfnzWLbjtjzyrNjg';

const $ = (id) => document.getElementById(id);
const form = $('form');
const message = $('message');

function say(text, tone = '') {
  if (!message) return;
  message.textContent = text;
  message.className = `message ${tone}`;
}

class WrongPassphrase extends Error {}

/** The signing key from key.enc.json, unlocked with the passphrase (made by license:seal-key). */
async function jwkFromPassphrase(pass) {
  if (!pass) throw new Error('Please enter the signing passphrase.');
  if (!crypto.subtle)
    throw new Error('Web Cryptography API is not available in this browser context.');
  const res = await fetch('key.enc.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load encrypted signing key.');
  const sealed = await res.json();
  if (sealed.v !== 1 || sealed.kdf !== 'PBKDF2-SHA256')
    throw new Error('Key file format version is unrecognized.');
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pass.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const aes = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64(sealed.salt), iterations: sealed.iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64(sealed.iv) },
      aes,
      b64(sealed.ct),
    );
  } catch {
    throw new WrongPassphrase('Incorrect passphrase. Authorization failed.');
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

async function jwkFromFile(file) {
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error('The chosen file is not a valid JSON key.');
  }
}

async function importKeys(jwk) {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.d || !jwk.x)
    throw new Error('The key format is not a valid Ed25519 private key.');
  if (jwk.x !== APP_PUBLIC_KEY) throw new Error('Key signature does not match Smaran application identity.');
  if (!crypto.subtle)
    throw new Error('This browser does not support WebCrypto Ed25519. Please use current Chrome, Edge, or Firefox.');
  try {
    const sign = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: jwk.x, d: jwk.d },
      { name: 'Ed25519' },
      false,
      ['sign'],
    );
    const verify = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: jwk.x },
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return { sign, verify };
  } catch {
    throw new Error('Ed25519 cryptography initialization failed.');
  }
}

async function publicIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
    if (res.ok) {
      const { ip } = await res.json();
      if (typeof ip === 'string' && ip.length <= 64) return ip;
    }
  } catch {}

  try {
    const res = await fetch('https://icanhazip.com', { cache: 'no-store' });
    if (res.ok) {
      const ip = (await res.text()).trim();
      if (typeof ip === 'string' && ip.length <= 64) return ip;
    }
  } catch {}

  try {
    const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    if (res.ok) {
      const { ip } = await res.json();
      if (typeof ip === 'string' && ip.length <= 64) return ip;
    }
  } catch {}

  return undefined;
}

let pageIp = null;

async function lookUpIp() {
  const note = $('ipnote');
  const dot = $('ipdot');
  try {
    pageIp = (await publicIp()) ?? null;
  } catch {
    pageIp = null;
  }
  if (dot) {
    dot.className = pageIp ? 'pulse-dot online' : 'pulse-dot offline';
  }
  if (note) {
    note.innerHTML = pageIp
      ? `Issuer IP: <strong>${pageIp}</strong> (verified)`
      : 'Couldn’t resolve public IP address. Connect to internet and reload.';
  }
  return pageIp;
}
void lookUpIp();

const longDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** The visible card: Smaran's warm dark look, the S mark, and the license details. */
export function drawCard(ctx, p, isVerified = false) {
  const { width: w, height: h } = ctx.canvas;
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#2b2b29');
  bg.addColorStop(1, '#1f1e1d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.85, h * 0.1, 0, w * 0.85, h * 0.1, w * 0.6);
  glow.addColorStop(0, 'rgba(217,119,87,0.28)');
  glow.addColorStop(1, 'rgba(217,119,87,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Border ring with Google quad-color accent
  const ring = ctx.createLinearGradient(0, 0, w, 0);
  ['#4285f4', '#ea4335', '#fbbc05', '#34a853'].forEach((c, i) => ring.addColorStop(i / 3, c));
  ctx.strokeStyle = ring;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(28, 28, w - 56, h - 56, 36);
  ctx.stroke();

  // The S mark: two arcs and a dot
  const s = 2.2;
  const ox = 90;
  const oy = 80;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#f5f4ef';
  ctx.lineWidth = 5 * s;
  ctx.beginPath();
  ctx.arc(ox + 32 * s, oy + 22 * s, 10 * s, (-30 * Math.PI) / 180, (-270 * Math.PI) / 180, true);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ox + 32 * s, oy + 42 * s, 10 * s, (-90 * Math.PI) / 180, (150 * Math.PI) / 180);
  ctx.stroke();
  ctx.fillStyle = '#8b8df8';
  ctx.beginPath();
  ctx.arc(
    ox + (32 + 25 * Math.cos(-Math.PI / 4)) * s,
    oy + (32 + 25 * Math.sin(-Math.PI / 4)) * s,
    5 * s,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  const serif = "'Source Serif 4 Variable', Georgia, serif";
  const sans = "'Inter Variable', 'Segoe UI', sans-serif";
  const mono = "'JetBrains Mono Variable', Consolas, monospace";

  ctx.fillStyle = '#f5f4ef';
  ctx.font = `italic 500 64px ${serif}`;
  ctx.fillText('Smaran', 260, 160);
  ctx.fillStyle = '#d97757';
  ctx.font = `600 22px ${sans}`;
  ctx.fillText('LICENSE', 264, 200);

  // Top right verification or live preview badge on card
  if (isVerified) {
    ctx.fillStyle = 'rgba(74, 222, 128, 0.16)';
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.5)';
    ctx.beginPath();
    ctx.roundRect(w - 290, 75, 194, 34, 8);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#4ade80';
    ctx.font = `600 13px ${sans}`;
    ctx.fillText('✓ ED25519 VERIFIED', w - 272, 97);
  } else {
    ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
    ctx.beginPath();
    ctx.roundRect(w - 250, 75, 154, 34, 8);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.font = `600 13px ${sans}`;
    ctx.fillText('● LIVE PREVIEW', w - 232, 97);
  }

  ctx.fillStyle = '#a6a39a';
  ctx.font = `20px ${sans}`;
  ctx.fillText('Licensed to', 96, 330);
  ctx.fillStyle = '#f5f4ef';
  let size = 58;
  const displayName = p.name ? p.name : 'Smaran';
  ctx.font = `600 ${size}px ${serif}`;
  while (ctx.measureText(displayName).width > w - 200 && size > 24) {
    size -= 2;
    ctx.font = `600 ${size}px ${serif}`;
  }
  ctx.fillText(displayName, 96, 400);

  const rows = [
    ['Duration', `${p.years} year${p.years === 1 ? '' : 's'}`],
    ['Issued', longDate(p.issued)],
    ['Expires', longDate(p.expires)],
  ];
  rows.forEach(([k, v], i) => {
    const x = 96 + i * 340;
    ctx.fillStyle = '#a6a39a';
    ctx.font = `18px ${sans}`;
    ctx.fillText(k, x, 490);
    ctx.fillStyle = '#f5f4ef';
    ctx.font = `600 28px ${serif}`;
    ctx.fillText(v, x, 530);
  });

  // Authorized Services banner
  ctx.fillStyle = '#a6a39a';
  ctx.font = `14px ${sans}`;
  ctx.fillText('AUTHORIZED SERVICES', 96, 590);

  const selectedSet = new Set(p.services || []);
  let curX = 96;
  ALL_SERVICES.forEach((svcId) => {
    const isIncluded = selectedSet.has(svcId);
    const name = SERVICE_NAMES[svcId] || svcId;
    const txt = isIncluded ? `✓ ${name}` : `✕ ${name} (Locked)`;
    ctx.font = `600 13px ${sans}`;
    const textW = ctx.measureText(txt).width;
    const badgeW = textW + 20;

    if (isIncluded) {
      ctx.fillStyle = 'rgba(74, 222, 128, 0.14)';
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.45)';
      ctx.beginPath();
      ctx.roundRect(curX, 602, badgeW, 26, 6);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#4ade80';
      ctx.fillText(txt, curX + 10, 619);
    } else {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.10)';
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.beginPath();
      ctx.roundRect(curX, 602, badgeW, 26, 6);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(248, 113, 113, 0.75)';
      ctx.fillText(txt, curX + 10, 619);
    }
    curX += badgeW + 10;
  });

  ctx.fillStyle = '#75736c';
  ctx.font = `15px ${mono}`;
  ctx.fillText(`ID ${p.id}`, 96, 665);
  ctx.font = `italic 17px ${serif}`;
  ctx.fillText('Gentle reminders, on your schedule.', 96, 695);
}

const blobOf = (canvas, type, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not generate the license image.'))),
      type,
      quality,
    ),
  );

let urls = [];
let activeLicenseId = '';
let isVerifiedSigned = false;

function getSelectedServices() {
  const services = [];
  if ($('svc-reminder')?.checked) services.push('reminder');
  if ($('svc-automation')?.checked) services.push('automation');
  if ($('svc-fileserver')?.checked) services.push('fileserver');
  if ($('svc-remotehub')?.checked) services.push('remotehub');
  return services;
}

function updateLivePreview() {
  if (isVerifiedSigned) return; // don't override signed card unless inputs change
  const canvas = $('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const name = $('name')?.value.trim() || 'Smaran';
  const years = Number($('years')?.value) || 1;
  const services = getSelectedServices();

  const countTag = $('service-count-tag');
  if (countTag) {
    countTag.textContent =
      services.length > 0
        ? `${services.length} / ${ALL_SERVICES.length} Services Active`
        : '0 / 4 Services Active (Select services below)';
  }

  const now = new Date();
  const expires = new Date(now);
  expires.setFullYear(expires.getFullYear() + years);

  const previewPayload = {
    name,
    years,
    services,
    id: 'PREVIEW-NOT-YET-SIGNED',
    issued: now.toISOString(),
    expires: expires.toISOString(),
    product: 'Smaran Pro / Workstation',
    issuer: 'Smaran License Portal',
    ip: pageIp ?? '0.0.0.0',
  };

  drawCard(ctx, previewPayload, false);

  // Update details table
  const dl = $('details');
  if (dl) {
    dl.replaceChildren();
    for (const [k, v] of [
      ['Licensee', previewPayload.name],
      ['Services', services.length ? services.map((s) => SERVICE_NAMES[s] || s).join(', ') : 'None (All Locked - Select services to activate)'],
      ['Duration', `${previewPayload.years} year(s)`],
      ['Valid Until', longDate(previewPayload.expires)],
      ['Status', 'Previewing (Click Create & Sign below to generate)'],
    ]) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
  }
}

// Preset Duration buttons
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.years;
    if (val) {
      const yearsInput = $('years');
      if (yearsInput) yearsInput.value = val;
      document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      isVerifiedSigned = false;
      resetVerifiedUI();
      updateLivePreview();
    }
  });
});

const yearsInput = $('years');
if (yearsInput) {
  yearsInput.addEventListener('input', () => {
    const val = yearsInput.value;
    document.querySelectorAll('.preset-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.years === val);
    });
    isVerifiedSigned = false;
    resetVerifiedUI();
    updateLivePreview();
  });
}

// Service Presets links
document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = btn.dataset.preset;
    const r = $('svc-reminder');
    const a = $('svc-automation');
    const f = $('svc-fileserver');
    const h = $('svc-remotehub');

    if (preset === 'all') {
      if (r) r.checked = true;
      if (a) a.checked = true;
      if (f) f.checked = true;
      if (h) h.checked = true;
    } else if (preset === 'remote') {
      if (r) r.checked = false;
      if (a) a.checked = false;
      if (f) f.checked = true;
      if (h) h.checked = true;
    } else if (preset === 'productivity') {
      if (r) r.checked = true;
      if (a) r.checked = true;
      if (f) f.checked = false;
      if (h) h.checked = false;
    }
    isVerifiedSigned = false;
    resetVerifiedUI();
    updateLivePreview();
  });
});

// Name input listener
$('name')?.addEventListener('input', () => {
  isVerifiedSigned = false;
  resetVerifiedUI();
  updateLivePreview();
});

// Service checkboxes listener
document.querySelectorAll('.services-selector input[type="checkbox"]').forEach((cb) => {
  cb.addEventListener('change', () => {
    isVerifiedSigned = false;
    resetVerifiedUI();
    updateLivePreview();
  });
});

function resetVerifiedUI() {
  const statusTag = $('status-tag');
  if (statusTag) {
    statusTag.className = 'result-tag preview-mode';
    const tagText = $('status-tag-text');
    if (tagText) tagText.textContent = 'Dynamic Live Preview';
  }
  const pngBtn = $('png');
  if (pngBtn) pngBtn.style.display = 'none';
  const copyBtn = $('copy-id');
  if (copyBtn) copyBtn.style.display = 'none';
  const prePrompt = $('pre-sign-prompt');
  if (prePrompt) prePrompt.style.display = 'flex';
}

// Passphrase Show/Hide Toggle
const togglePassBtn = $('toggle-pass');
if (togglePassBtn) {
  togglePassBtn.addEventListener('click', () => {
    const passInput = $('pass');
    if (!passInput) return;
    const isPassword = passInput.type === 'password';
    passInput.type = isPassword ? 'text' : 'password';
    togglePassBtn.classList.toggle('showing', isPassword);
    togglePassBtn.setAttribute('aria-label', isPassword ? 'Hide passphrase' : 'Show passphrase');
  });
}

// Theme Toggle
const themeBtn = document.querySelector('.theme-toggle');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('smaran-theme', next);
    } catch {}
  });
}

// Copy License ID button
const copyIdBtn = $('copy-id');
if (copyIdBtn) {
  copyIdBtn.addEventListener('click', async () => {
    if (!activeLicenseId) return;
    try {
      await navigator.clipboard.writeText(activeLicenseId);
      const originalHtml = copyIdBtn.innerHTML;
      copyIdBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Copied ID!
      `;
      setTimeout(() => {
        copyIdBtn.innerHTML = originalHtml;
      }, 2000);
    } catch {
      prompt('License ID:', activeLicenseId);
    }
  });
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('make');
  button.disabled = true;
  say('Verifying credentials & unlocking cryptographic key…');
  try {
    const name = $('name')?.value.trim() || 'Smaran';
    const years = Number($('years').value);
    const services = getSelectedServices();

    if (services.length === 0) {
      throw new Error('Please select at least one authorized service to activate.');
    }

    const file = $('key').files?.[0];
    const pass = $('pass')?.value.trim();
    if (!file && !pass) {
      $('pass')?.focus();
      throw new Error('Please enter the signing passphrase.');
    }

    buildPayload({
      name,
      years,
      services,
      id: 'check',
      now: new Date(),
      issuer: 'Smaran Register',
      ip: '0.0.0.0',
    });

    say('Unlocking signing key…');
    const keys = await importKeys(file ? await jwkFromFile(file) : await jwkFromPassphrase(pass));
    const ip = pageIp ?? (await lookUpIp());
    if (!ip) throw new Error('Couldn’t detect your IP address. Please check connection and try again.');

    say('Signing cryptographic payload with Ed25519…');
    const payload = buildPayload({
      name,
      years,
      services,
      id: crypto.randomUUID(),
      now: new Date(),
      issuer: 'Smaran Register',
      ip,
    });
    const bytes = payloadBytes(payload);
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.sign, bytes));
    const container = encodeContainer(bytes, signature);

    const canvas = $('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await document.fonts.ready;
    drawCard(ctx, payload, true);

    // Embed steganographic LSB bits into canvas pixels
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    embedBits(image.data, container);
    ctx.putImageData(image, 0, 0);

    // Roundtrip verification: extract and verify digital signature
    const back = decodeContainer(
      extractBits(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
    );
    const ok = await crypto.subtle.verify(
      'Ed25519',
      keys.verify,
      back.signature,
      back.payloadBytes,
    );
    if (!ok || back.payload.id !== payload.id)
      throw new Error('Cryptographic self-verification failed. Please try again.');

    const png = await blobOf(canvas, 'image/png');
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [URL.createObjectURL(png)];
    const safe = payload.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'license';

    const pngBtn = $('png');
    if (pngBtn) {
      pngBtn.href = urls[0];
      pngBtn.download = `Smaran-License-${safe}.png`;
      pngBtn.style.display = 'inline-flex';
    }

    if (copyIdBtn) copyIdBtn.style.display = 'inline-flex';
    const prePrompt = $('pre-sign-prompt');
    if (prePrompt) prePrompt.style.display = 'none';

    activeLicenseId = payload.id;
    isVerifiedSigned = true;

    const statusTag = $('status-tag');
    if (statusTag) {
      statusTag.className = 'result-tag verified-mode';
      const tagText = $('status-tag-text');
      if (tagText) tagText.textContent = '✓ Cryptographically Verified (Ed25519)';
    }

    const dl = $('details');
    if (dl) {
      dl.replaceChildren();
      for (const [k, v] of [
        ['Licensee', payload.name],
        ['License ID', payload.id],
        ['Product', payload.product],
        ['Services', (payload.services || []).map((s) => SERVICE_NAMES[s] || s).join(', ')],
        ['Duration', `${payload.years} year(s)`],
        ['Issued On', longDate(payload.issued)],
        ['Valid Until', longDate(payload.expires)],
        ['Issuer IP', payload.ip ?? 'None'],
        ['Verification', '256-bit Ed25519 Elliptic-Curve Signature (RFC 8032)'],
      ]) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        dl.append(dt, dd);
      }
    }

    say('License generated and cryptographically signed! Click Download License (.png) to save.', 'ok');
  } catch (error) {
    if (error instanceof WrongPassphrase) {
      const passInput = $('pass');
      if (passInput) {
        passInput.value = '';
        passInput.focus();
      }
    }
    say(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    button.disabled = false;
    $('key').value = '';
  }
});

// Initial live preview render
document.fonts.ready.then(() => {
  updateLivePreview();
});
setTimeout(updateLivePreview, 100);
