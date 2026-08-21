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
  if (req.session && req.session.isAdmin && req.session.role === 'admin') return next();
  return res.status(403).json({ error: 'Only the main admin can do this.' });
}
// Finance-team accounts: full lead visibility (like admin) but no vehicle/dealer management
function isFinanceOrAdmin(req) {
  return req.session && req.session.isAdmin && (req.session.role === 'admin' || req.session.role === 'finance');
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
    rows = db.prepare("SELECT * FROM vehicles WHERE is_active = 1 AND approval_status = 'approved' AND category = ? ORDER BY created_at DESC").all(category);
  } else {
    rows = db.prepare("SELECT * FROM vehicles WHERE is_active = 1 AND approval_status = 'approved' ORDER BY created_at DESC").all();
  }
  res.json(rows);
});

// Public: single vehicle detail (for the detail popup)
app.get('/api/vehicles/:id', (req, res) => {
  const row = db.prepare("SELECT * FROM vehicles WHERE id = ? AND is_active = 1 AND approval_status = 'approved'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

function slugify(text) {
  return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Public: lookup vehicle by SEO-friendly slug e.g. "maruti-swift"
app.get('/api/vehicles/by-slug/:slug', (req, res) => {
  const rows = db.prepare("SELECT * FROM vehicles WHERE is_active = 1 AND approval_status = 'approved'").all();
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
  if (user.is_active === 0) {
    return res.status(403).json({ error: 'This account has been deactivated. Contact MK Finance.' });
  }
  req.session.isAdmin = true;
  req.session.userId = user.id;
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
  const rows = db.prepare("SELECT id, username, role, brand, is_active FROM admin_users WHERE role IN ('dealer', 'finance') ORDER BY id DESC").all();
  res.json(rows);
});

// Toggle a dealer account active/inactive (deactivated dealers can't log in, existing sessions still work until they log out)
app.put('/api/admin/dealers/:id/toggle-active', requireSuperAdmin, (req, res) => {
  const dealer = db.prepare("SELECT is_active FROM admin_users WHERE id = ? AND role IN ('dealer', 'finance')").get(req.params.id);
  if (!dealer) return res.status(404).json({ error: 'Account not found.' });
  const newStatus = dealer.is_active ? 0 : 1;
  db.prepare('UPDATE admin_users SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);
  res.json({ success: true, is_active: newStatus });
});

app.post('/api/admin/dealers', requireSuperAdmin, (req, res) => {
  const { username, password, brand, role } = req.body;
  const accountRole = role === 'finance' ? 'finance' : 'dealer';
  if (!username || !password || (accountRole === 'dealer' && !brand)) {
    return res.status(400).json({ error: accountRole === 'dealer' ? 'Username, password and brand are required.' : 'Username and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (existing) return res.status(400).json({ error: 'Username already taken.' });
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO admin_users (username, password_hash, role, brand) VALUES (?, ?, ?, ?)').run(username, hash, accountRole, accountRole === 'dealer' ? brand : null);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/admin/dealers/:id', requireSuperAdmin, (req, res) => {
  db.prepare("DELETE FROM admin_users WHERE id = ? AND role IN ('dealer', 'finance')").run(req.params.id);
  res.json({ success: true });
});

// =========================================================
// ADMIN: INQUIRIES
// =========================================================

app.get('/api/admin/inquiries', requireAuth, (req, res) => {
  let rows;
  if (req.session.role === 'dealer') {
    rows = db.prepare('SELECT * FROM inquiries WHERE brand = ? OR assigned_dealer_id = ? ORDER BY created_at DESC').all(req.session.brand, req.session.userId);
  } else {
    rows = db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all();
  }
  res.json(rows);
});

function dealerCanAccessInquiry(req, inquiryId) {
  if (req.session.role !== 'dealer') return true;
  const row = db.prepare('SELECT brand, assigned_dealer_id FROM inquiries WHERE id = ?').get(inquiryId);
  if (!row) return false;
  return row.brand === req.session.brand || row.assigned_dealer_id === req.session.userId;
}

// Super-admin: assign/transfer a lead to a specific dealer account (or unassign with dealerId = null)
app.put('/api/admin/inquiries/:id/assign', requireSuperAdmin, (req, res) => {
  const { dealerId } = req.body;
  db.prepare('UPDATE inquiries SET assigned_dealer_id = ? WHERE id = ?').run(dealerId || null, req.params.id);
  res.json({ success: true });
});

app.put('/api/admin/inquiries/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  if (!dealerCanAccessInquiry(req, req.params.id)) return res.status(403).json({ error: 'Not your lead.' });
  db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// ===== QUOTATION FIELD TEMPLATES (reusable custom fields) =====

// Anyone logged in (admin or dealer) can view the list of reusable fields
app.get('/api/admin/quotation-fields', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM quotation_field_templates ORDER BY label ASC').all();
  res.json(rows);
});

// Create a new reusable field — requires the current user's own password as a confirmation step
app.post('/api/admin/quotation-fields', requireAuth, (req, res) => {
  const { label, password } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'Field name required.' });
  if (!password) return res.status(400).json({ error: 'Password required to create a new field.' });
  const user = db.prepare('SELECT password_hash FROM admin_users WHERE id = ?').get(req.session.userId);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  const existing = db.prepare('SELECT id FROM quotation_field_templates WHERE label = ?').get(label.trim());
  if (existing) return res.json({ success: true, id: existing.id }); // already exists, just reuse it
  const result = db.prepare('INSERT INTO quotation_field_templates (label, created_by) VALUES (?, ?)').run(label.trim(), req.session.username || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

// Super-admin only: remove a reusable field template so it stops appearing for everyone
app.delete('/api/admin/quotation-fields/:id', requireSuperAdmin, (req, res) => {
  db.prepare('DELETE FROM quotation_field_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/admin/inquiries/:id/quotation', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id FROM inquiries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Inquiry not found.' });
  if (!dealerCanAccessInquiry(req, req.params.id)) return res.status(403).json({ error: 'Not your lead.' });
  const { vehiclePrice, discount, insurance, rto, otherCharges, customFields, finalPrice, notes } = req.body;
  const quotation = JSON.stringify({
    vehiclePrice: vehiclePrice || 0,
    discount: discount || 0,
    insurance: insurance || 0,
    rto: rto || 0,
    otherCharges: otherCharges || 0,
    customFields: Array.isArray(customFields) ? customFields.filter(f => f && f.label) : [],
    finalPrice: finalPrice || 0,
    notes: notes || '',
    generatedAt: new Date().toISOString(),
    generatedBy: req.session.username || ''
  });
  db.prepare('UPDATE inquiries SET quotation = ? WHERE id = ?').run(quotation, req.params.id);
  res.json({ success: true });
});

// Add a timestamped follow-up note (call log, meeting log, etc.) to a lead
app.post('/api/admin/inquiries/:id/notes', requireAuth, (req, res) => {
  const row = db.prepare('SELECT notes FROM inquiries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Inquiry not found.' });
  if (!dealerCanAccessInquiry(req, req.params.id)) return res.status(403).json({ error: 'Not your lead.' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Note text required.' });
  const existing = row.notes ? JSON.parse(row.notes) : [];
  existing.push({ text: text.trim(), author: req.session.username || '', timestamp: new Date().toISOString() });
  db.prepare('UPDATE inquiries SET notes = ? WHERE id = ?').run(JSON.stringify(existing), req.params.id);
  res.json({ success: true, notes: existing });
});

// Finalize a deal — loan amount, down payment, EMI, tenure, documentation/finance charges, any other charges
app.put('/api/admin/inquiries/:id/deal-closure', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id FROM inquiries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Inquiry not found.' });
  if (!dealerCanAccessInquiry(req, req.params.id)) return res.status(403).json({ error: 'Not your lead.' });
  const { loanAmount, downPayment, emiAmount, tenureMonths, docCharges, financeCharges, customFields, notes } = req.body;
  const dealClosure = JSON.stringify({
    loanAmount: loanAmount || 0,
    downPayment: downPayment || 0,
    emiAmount: emiAmount || 0,
    tenureMonths: tenureMonths || 0,
    docCharges: docCharges || 0,
    financeCharges: financeCharges || 0,
    customFields: Array.isArray(customFields) ? customFields.filter(f => f && f.label) : [],
    notes: notes || '',
    closedBy: req.session.username || '',
    closedAt: new Date().toISOString()
  });
  db.prepare('UPDATE inquiries SET deal_closure = ? WHERE id = ?').run(dealClosure, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/inquiries/:id', requireAuth, (req, res) => {
  if (!dealerCanAccessInquiry(req, req.params.id)) return res.status(403).json({ error: 'Not your lead.' });
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

// Finance-team accounts manage deal closures only — they can't touch vehicle listings
function blockFinance(req, res, next) {
  if (req.session.role === 'finance') return res.status(403).json({ error: 'Finance accounts cannot manage vehicles.' });
  next();
}

app.post('/api/admin/vehicles', requireAuth, blockFinance, (req, res) => {
  let {
    category, brand, model, year, price, fuel_type, image_url, icon, emi, tags, variants,
    expert_note, gallery_images, colors, detailed_specs, key_features, custom_fields,
    ex_showroom_price, rto_charges, insurance_charges, extended_warranty, tcs_charges,
    handling_charges, onroad_price, offer_text, description
  } = req.body;
  if (req.session.role === 'dealer') brand = req.session.brand; // dealers can only add vehicles under their own brand
  if (!category || !brand || !model) {
    return res.status(400).json({ error: 'Category, Brand, Model required.' });
  }
  // Dealer-submitted listings go live only after admin approval; admin-added listings go live immediately.
  const approvalStatus = req.session.role === 'dealer' ? 'pending' : 'approved';
  const stmt = db.prepare(`INSERT INTO vehicles (category, brand, model, year, price, fuel_type, image_url, icon, emi, tags, variants, expert_note, gallery_images, colors, detailed_specs, key_features, custom_fields, ex_showroom_price, rto_charges, insurance_charges, extended_warranty, tcs_charges, handling_charges, onroad_price, offer_text, description, approval_status, submitted_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const result = stmt.run(
    category, brand, model, year || '', price || '', fuel_type || '', image_url || '', icon || '🚗', emi || '',
    tags || 'NEW,LOAN READY,INSURE', variants || '', expert_note || '', gallery_images || '', colors || '',
    detailed_specs || '', key_features || '', custom_fields || '', ex_showroom_price || '', rto_charges || '',
    insurance_charges || '', extended_warranty || '', tcs_charges || '', handling_charges || '', onroad_price || '',
    offer_text || '', description || '', approvalStatus, req.session.username || ''
  );
  res.json({ success: true, id: result.lastInsertRowid, approval_status: approvalStatus });
});

app.put('/api/admin/vehicles/:id', requireAuth, blockFinance, (req, res) => {
  let {
    category, brand, model, year, price, fuel_type, image_url, icon, emi, tags, variants,
    expert_note, gallery_images, colors, detailed_specs, key_features, custom_fields,
    ex_showroom_price, rto_charges, insurance_charges, extended_warranty, tcs_charges,
    handling_charges, onroad_price, offer_text, description, is_active
  } = req.body;
  let approvalStatus;
  if (req.session.role === 'dealer') {
    const existing = db.prepare('SELECT brand FROM vehicles WHERE id = ?').get(req.params.id);
    if (!existing || existing.brand !== req.session.brand) return res.status(403).json({ error: 'You can only edit your own brand\'s vehicles.' });
    brand = req.session.brand;
    approvalStatus = 'pending'; // any dealer edit needs re-approval before it's shown to customers
  } else {
    approvalStatus = 'approved';
  }
  db.prepare(`UPDATE vehicles SET category=?, brand=?, model=?, year=?, price=?, fuel_type=?, image_url=?, icon=?, emi=?, tags=?, variants=?, expert_note=?, gallery_images=?, colors=?, detailed_specs=?, key_features=?, custom_fields=?, ex_showroom_price=?, rto_charges=?, insurance_charges=?, extended_warranty=?, tcs_charges=?, handling_charges=?, onroad_price=?, offer_text=?, description=?, approval_status=?, is_active=?
    WHERE id=?`).run(
    category, brand, model, year, price, fuel_type, image_url, icon || '🚗', emi, tags, variants || '',
    expert_note || '', gallery_images || '', colors || '', detailed_specs || '', key_features || '',
    custom_fields || '', ex_showroom_price || '', rto_charges || '', insurance_charges || '', extended_warranty || '',
    tcs_charges || '', handling_charges || '', onroad_price || '', offer_text || '', description,
    approvalStatus, is_active ? 1 : 0, req.params.id
  );
  res.json({ success: true });
});

// Super-admin: approve a dealer-submitted listing so it goes live on the public site
app.put('/api/admin/vehicles/:id/approve', requireSuperAdmin, (req, res) => {
  db.prepare("UPDATE vehicles SET approval_status = 'approved' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/vehicles/:id', requireAuth, blockFinance, (req, res) => {
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

// Admin login/panel — for the main super-admin (MK Finance owner)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Dealer login/panel — same panel, but its own dedicated link to give to brand dealers.
// The panel auto-detects the logged-in account's role and shows the right view either way.
app.get('/dealer', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'admin', 'index.html'), 'utf8');
  html = html
    .replace('Admin Panel Login', 'Dealer Login')
    .replace('<title>MK Finance - Admin Panel</title>', '<title>MK Finance - Dealer Login</title>');
  res.send(html);
});

// Pretty vehicle URL: /maruti/swift -> serves the vehicle detail page with real meta tags injected (SEO)
app.get('/:brand/:model', (req, res, next) => {
  // Only handle simple slug-like segments; let everything else (e.g. real static paths) fall through
  if (!/^[a-z0-9-]+$/i.test(req.params.brand) || !/^[a-z0-9-]+$/i.test(req.params.model)) return next();

  const rows = db.prepare("SELECT * FROM vehicles WHERE is_active = 1 AND approval_status = 'approved'").all();
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
  const rows = db.prepare("SELECT * FROM vehicles WHERE is_active = 1 AND approval_status = 'approved'").all();
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
