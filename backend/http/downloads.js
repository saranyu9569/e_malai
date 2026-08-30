const crypto = require('crypto');

/**
 * ที่พักไฟล์ PNG ชั่วคราวสำหรับดาวน์โหลด (ให้ได้ชื่อไฟล์ภาษาไทยถูกต้องแม้บน iOS/Safari)
 * client POST /prepare-download { png(dataURL), name } → ได้ token → เปิด /dl/:token
 */
class DownloadTokenStore {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.map = new Map(); // token -> { buf, name, at }
    setInterval(() => this.sweep(), 60 * 1000).unref();
  }

  sweep() {
    const now = Date.now();
    for (const [k, v] of this.map) if (now - v.at > this.ttlMs) this.map.delete(k);
  }

  create(buf, name) {
    this.sweep();
    if (this.map.size > 300) return null;
    const token = crypto.randomBytes(12).toString('hex');
    this.map.set(token, { buf, name, at: Date.now() });
    return token;
  }

  take(token) {
    const item = this.map.get(token);
    if (item) this.map.delete(token); // ใช้ครั้งเดียว
    return item;
  }
}

// เซิร์ฟเวอร์ตอบด้วย Content-Disposition: attachment; filename*=UTF-8''...
function registerDownloadRoutes(app, store) {
  app.post('/prepare-download', (req, res) => {
    const { png, name } = req.body || {};
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(png || ''));
    if (!m) return res.status(400).json({ ok: false });
    const buf = Buffer.from(m[1], 'base64');
    if (!buf.length || buf.length > 10 * 1024 * 1024) return res.status(413).json({ ok: false });
    const safe = String(name || '')
      .replace(/[^\p{L}\p{M}\p{N} ._-]/gu, '') // \p{M} = สระ/วรรณยุกต์ไทย
      .replace(/\s+/g, '-')
      .replace(/^[-_.]+|[-_.]+$/g, '')
      .slice(0, 80) || 'e-malai';
    const token = store.create(buf, safe);
    if (!token) return res.status(429).json({ ok: false });
    res.json({ ok: true, token });
  });

  app.get('/dl/:token', (req, res) => {
    const item = store.take(req.params.token);
    if (!item) return res.status(404).send('ลิงก์ดาวน์โหลดหมดอายุแล้ว');
    const full = (item.name.endsWith('.png') ? item.name : item.name + '.png');
    let asciiBase = full.replace(/\.png$/i, '').replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '').replace(/^[-_.\s]+|[-_.\s]+$/g, '');
    if (!/[A-Za-z0-9]/.test(asciiBase)) asciiBase = 'e-malai';
    const ascii = asciiBase + '.png';
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(full)}`
    );
    res.send(item.buf);
  });
}

module.exports = { DownloadTokenStore, registerDownloadRoutes };
