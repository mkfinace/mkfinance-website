require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// =========================================================
// PUBLIC API
// =========================================================

// Submit contact/inquiry form (from index.html)
app.post('/api/inquiry', (req, res) => {
  const { name, mobile, service, vehicle_type, message } = req.body;
  if (!name || !mobile) {
    return res.status(400).json({ error: 'Name and Mobile number required.' });
  }
  const stmt = db.prepare(`INSERT INTO inquiries (name, mobile, service, vehicle_type, message)
    VALUES (?, ?, ?, ?, ?)`);
  const result = stmt.run(name, mobile, service || '', vehicle_type || '', message || '');
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
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/admin/me', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.isAdmin), username: req.session ? req.session.username : null });
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
// ADMIN: INQUIRIES
// =========================================================

app.get('/api/admin/inquiries', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all();
  res.json(rows);
});

app.put('/api/admin/inquiries/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/inquiries/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =========================================================
// ADMIN: VEHICLES (CRUD)
// =========================================================

app.get('/api/admin/vehicles', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM vehicles ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/admin/vehicles', requireAuth, (req, res) => {
  const { category, brand, model, year, price, fuel_type, image_url, icon, emi, tags, variants, expert_note, gallery_images, colors, description } = req.body;
  if (!category || !brand || !model) {
    return res.status(400).json({ error: 'Category, Brand, Model required.' });
  }
  const stmt = db.prepare(`INSERT INTO vehicles (category, brand, model, year, price, fuel_type, image_url, icon, emi, tags, variants, expert_note, gallery_images, colors, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const result = stmt.run(category, brand, model, year || '', price || '', fuel_type || '', image_url || '', icon || '🚗', emi || '', tags || 'NEW,LOAN READY,INSURE', variants || '', expert_note || '', gallery_images || '', colors || '', description || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/admin/vehicles/:id', requireAuth, (req, res) => {
  const { category, brand, model, year, price, fuel_type, image_url, icon, emi, tags, variants, expert_note, gallery_images, colors, description, is_active } = req.body;
  db.prepare(`UPDATE vehicles SET category=?, brand=?, model=?, year=?, price=?, fuel_type=?, image_url=?, icon=?, emi=?, tags=?, variants=?, expert_note=?, gallery_images=?, colors=?, description=?, is_active=?
    WHERE id=?`).run(category, brand, model, year, price, fuel_type, image_url, icon || '🚗', emi, tags, variants || '', expert_note || '', gallery_images || '', colors || '', description, is_active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/vehicles/:id', requireAuth, (req, res) => {
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

app.listen(PORT, () => {
  console.log(`🚀 MK Finance website running at http://localhost:${PORT}`);
  console.log(`🔐 Admin panel: http://localhost:${PORT}/admin (admin / mkfinance@123)`);
});
