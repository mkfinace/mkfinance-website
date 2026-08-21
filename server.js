require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
app.disable('etag'); // prevent 304 Not Modified responses that break fetch() res.ok checks
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' })); // higher limit to allow base64 image uploads
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'mkfinance-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

// ===== AUTH MIDDLEWARE =====
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Unauthorized. Please login.' });
}
// Only the main admin (not a brand-scoped dealer) may manage dealer accounts
function requireSuperAdmin(req, res, next) {
  if (req.session && req.session.isAdmin && req.session.role !== 'dealer') return next();
  return res.status(403).json({ error: 'Only the main admin can do this.' });
}

// =========================================================
// PUBLIC API
// =========================================================

// Submit contact/inquiry form (from index.html)
app.post('/api/inquiry', (req, res) => {
  const { name, mobile, service, vehicle_type, message, brand } = req.body;
  if (!name || !mobile) {
    return res.status(400).json({ error: 'Name and Mobile number required.' });
  }
  const stmt = db.prepare(`INSERT INTO inquiries (name, mobile, service, vehicle_type, brand, message)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const result = stmt.run(name, mobile, service || '', vehicle_type || '', brand || '', message || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

// Public: list active vehicles (optionally filter by category)
app.get('/api/vehicles', (req, res) => {
  const { category } = req.query;
  let rows;
  if (category) {
    rows = db.prepare('SELECT * FROM vehicles WHERE is_active = 1 AND category = ? ORDER BY created_at DESC').all(category);
  } else {
    rows = db.prepare('SELECT * FROM vehicles WHERE is_active = 1 ORDER BY created_at DESC').all();
  }
  res.json(rows);
});

// Public: single vehicle detail (for the detail popup)
app.get('/api/vehicles/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM vehicles WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

function slugify(text) {
  return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Public: lookup vehicle by SEO-friendly slug e.g. "maruti-swift"
app.get('/api/vehicles/by-slug/:slug', (req, res) => {
  const rows = db.prepare('SELECT * FROM vehicles WHERE is_active = 1').all();
  const match = rows.find(v => slugify(v.brand + '-' + v.model) === req.params.slug);
  if (!match) return res.status(404).json({ error: 'Not found' });
  res.json(match);
});

// =========================================================
// ADMIN AUTH
// =========================================================

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  req.session.isAdmin = true;
  req.session.username = username;
  req.session.role = user.role || 'admin';
  req.session.brand = user.brand || null;
  res.json({ success: true, role: req.session.role, brand: req.session.brand });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/admin/me', (req, res) => {
  res.json({
    loggedIn: !!(req.session && req.session.isAdmin),
    username: req.session ? req.session.username : null,
    role: req.session ? req.session.role : null,
    brand: req.session ? req.session.brand : null
  });
});

app.post('/api/admin/change-password', requireAuth, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').run(hash, req.session.username);
  res.json({ success: true });
});

// =========================================================
// ADMIN: DEALER ACCOUNTS (super admin only)
// =========================================================

app.get('/api/admin/dealers', requireSuperAdmin, (req, res) => {
  const rows = db.prepare("SELECT id, username, role, brand FROM admin_users WHERE role = 'dealer' ORDER BY id DESC").all();
  res.json(rows);
});

app.post('/api/admin/dealers', requireSuperAdmin, (req, res) => {
  const { username, password, brand } = req.body;
  if (!username || !password || !brand) {
    return res.status(400).json({ error: 'Username, password and brand are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (existing) return res.status(400).json({ error: 'Username already taken.' });
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO admin_users (username, password_hash, role, brand) VALUES (?, ?, 'dealer', ?)").run(username, hash, brand);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/admin/dealers/:id', requireSuperAdmin, (req, res) => {
  db.prepare("DELETE FROM admin_users WHERE id = ? AND role = 'dealer'").run(req.params.id);
  res.json({ success: true });
});

// =========================================================
// ADMIN: INQUIRIES
// =========================================================

app.get('/api/admin/inquiries', requireAuth, (req, res) => {
  let rows;
  if (req.session.role === 'dealer') {
    rows = db.prepare('SELECT * FROM inquiries WHERE brand = ? ORDER BY created_at DESC').all(req.session.brand);
  } else {
    rows = db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all();
  }
  res.json(rows);
});

app.put('/api/admin/inquiries/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  if (req.session.role === 'dealer') {
    const row = db.prepare('SELECT brand FROM inquiries WHERE id = ?').get(req.params.id);
    if (!row || row.brand !== req.session.brand) return res.status(403).json({ error: 'Not your lead.' });
  }
  db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

app.put('/api/admin/inquiries/:id/quotation', requireAuth, (req, res) => {
  const row = db.prepare('SELECT brand FROM inquiries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Inquiry not found.' });
  if (req.session.role === 'dealer' && row.brand !== req.session.brand) {
    return res.status(403).json({ error: 'Not your lead.' });
  }
  const { vehiclePrice, discount, insurance, rto, otherCharges, finalPrice, notes } = req.body;
  const quotation = JSON.stringify({
    vehiclePrice: vehiclePrice || 0,
    discount: discount || 0,
    insurance: insurance || 0,
    rto: rto || 0,
    otherCharges: otherCharges || 0,
    finalPrice: finalPrice || 0,
    notes: notes || '',
    generatedAt: new Date().toISOString(),
    generatedBy: req.session.username || ''
  });
  db.prepare('UPDATE inquiries SET quotation = ? WHERE id = ?').run(quotation, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/inquiries/:id', requireAuth, (req, res) => {
  if (req.session.role === 'dealer') {
    const row = db.prepare('SELECT brand FROM inquiries WHERE id = ?').get(req.params.id);
    if (!row || row.brand !== req.session.brand) return res.status(403).json({ error: 'Not your lead.' });
  }
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========================================================
// ADMIN: VEHICLES (CRUD)
// =========================================================

app.get('/api/admin/vehicles', requireAuth, (req, res) => {
  let rows;
  if (req.session.role === 'dealer') {
    rows = db.prepare('SELECT * FROM vehicles WHERE brand = ? ORDER BY created_at DESC').all(req.session.brand);
  } else {
    rows = db.prepare('SELECT * FROM vehicles ORDER BY created_at DESC').all();
  }
  res.json(rows);
});

app.post('/api/admin/vehicles', requireAuth, (req, res) => {
  let { category, brand, model, year, price, fuel_type, image_url, icon, emi, tags, variants, expert_note, gallery_images, colors, detailed_specs, key_features, description } = req.body;
  if (req.session.role === 'dealer') brand = req.session.brand; // dealers can only add vehicles under their own brand
  if (!category || !brand || !model) {
    return res.status(400).json({ error: 'Category, Brand, Model required.' });
  }
  const stmt = db.prepare(`INSERT INTO vehicles (category, brand, model, year, price, fuel_type, image_url, icon, emi, tags, variants, expert_note, gallery_images, colors, detailed_specs, key_features, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const result = stmt.run(category, brand, model, year || '', price || '', fuel_type || '', image_url || '', icon || '🚗', emi || '', tags || 'NEW,LOAN READY,INSURE', variants || '', expert_note || '', gallery_images || '', colors || '', detailed_specs || '', key_features || '', description || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/admin/vehicles/:id', requireAuth, (req, res) => {
  let { category, brand, model, year, price, fuel_type, image_url, icon, emi, tags, variants, expert_note, gallery_images, colors, detailed_specs, key_features, description, is_active } = req.body;
  if (req.session.role === 'dealer') {
    const existing = db.prepare('SELECT brand FROM vehicles WHERE id = ?').get(req.params.id);
    if (!existing || existing.brand !== req.session.brand) return res.status(403).json({ error: 'You can only edit your own brand\'s vehicles.' });
    brand = req.session.brand;
  }
  db.prepare(`UPDATE vehicles SET category=?, brand=?, model=?, year=?, price=?, fuel_type=?, image_url=?, icon=?, emi=?, tags=?, variants=?, expert_note=?, gallery_images=?, colors=?, detailed_specs=?, key_features=?, description=?, is_active=?
    WHERE id=?`).run(category, brand, model, year, price, fuel_type, image_url, icon || '🚗', emi, tags, variants || '', expert_note || '', gallery_images || '', colors || '', detailed_specs || '', key_features || '', description, is_active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/vehicles/:id', requireAuth, (req, res) => {
  if (req.session.role === 'dealer') {
    const existing = db.prepare('SELECT brand FROM vehicles WHERE id = ?').get(req.params.id);
    if (!existing || existing.brand !== req.session.brand) return res.status(403).json({ error: 'You can only delete your own brand\'s vehicles.' });
  }
  db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========================================================
// STATIC FILES (public website + admin panel)
// =========================================================
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Pretty vehicle URL: /maruti/swift -> serves the vehicle detail page with real meta tags injected (SEO)
app.get('/:brand/:model', (req, res, next) => {
  // Only handle simple slug-like segments; let everything else (e.g. real static paths) fall through
  if (!/^[a-z0-9-]+$/i.test(req.params.brand) || !/^[a-z0-9-]+$/i.test(req.params.model)) return next();

  const rows = db.prepare('SELECT * FROM vehicles WHERE is_active = 1').all();
  const wanted = req.params.brand + '-' + req.params.model;
  const match = rows.find(v => slugify(v.brand + '-' + v.model) === wanted);

  let html = fs.readFileSync(path.join(__dirname, 'public', 'vehicle.html'), 'utf8');

  if (match) {
    const title = `${match.brand} ${match.model} Price, Specs & EMI | MK Finance`;
    const desc = `${match.brand} ${match.model} price ${match.price || ''}. Check specs, variants, EMI options and apply for a vehicle loan with MK Finance, Valsad.`.replace(/\s+/g, ' ').trim();
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Vehicle',
      name: `${match.brand} ${match.model}`,
      brand: match.brand,
      model: match.model,
      vehicleModelDate: match.year || undefined,
      fuelType: match.fuel_type || undefined,
      offers: match.price ? { '@type': 'Offer', priceCurrency: 'INR', price: (match.price.match(/[\d.]+/) || [''])[0] } : undefined
    });
    html = html
      .replace('<title>Vehicle Details | MK Finance</title>', `<title>${title}</title>`)
      .replace('</head>', `<meta name="description" content="${desc}">\n<script type="application/ld+json">${jsonLd}</script>\n</head>`);
  }
  res.send(html);
});

// SEO: sitemap.xml listing homepage + every active vehicle
app.get('/sitemap.xml', (req, res) => {
  const rows = db.prepare('SELECT * FROM vehicles WHERE is_active = 1').all();
  const base = `${req.protocol}://${req.get('host')}`;
  const urls = [
    `<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${base}/about.html</loc><changefreq>monthly</changefreq></url>`,
    ...rows.map(v => `<url><loc>${base}/${slugify(v.brand)}/${slugify(v.model)}</loc><changefreq>weekly</changefreq></url>`)
  ].join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
});

app.get('/robots.txt', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${base}/sitemap.xml`);
});

app.listen(PORT, () => {
  console.log(`🚀 MK Finance website running at http://localhost:${PORT}`);
  console.log(`🔐 Admin panel: http://localhost:${PORT}/admin (admin / mkfinance@123)`);
});
