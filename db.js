const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'mkfinance.db'));
db.pragma('journal_mode = WAL');

// ===== TABLES =====
db.exec(`
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  service TEXT,
  vehicle_type TEXT,
  message TEXT,
  status TEXT DEFAULT 'New',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,        -- Car, Truck, Tractor, etc.
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year TEXT,
  price TEXT,
  fuel_type TEXT,
  image_url TEXT,
  icon TEXT DEFAULT '🚗',        -- emoji icon shown on homepage card
  emi TEXT,                      -- display text e.g. "EMI ₹13,200/mo"
  tags TEXT DEFAULT 'NEW,LOAN READY,INSURE',
  variants TEXT,                  -- comma separated e.g. "VXi, ZXi, ZXi+, ZXi AMT"
  expert_note TEXT,               -- admin's own short opinion/highlight about the vehicle
  gallery_images TEXT,            -- comma separated additional photo URLs (image_url is the main/first photo)
  colors TEXT,                    -- comma separated color names available for this vehicle
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
`);

// ===== SEED DEFAULT ADMIN (username: admin / password: mkfinance@123) =====
const existingAdmin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get('admin');
if (!existingAdmin) {
  const hash = bcrypt.hashSync('mkfinance@123', 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('✅ Default admin created -> username: admin | password: mkfinance@123 (please change after first login)');
}

// ===== SEED SAMPLE VEHICLES (only if table empty) =====
const vehicleCount = db.prepare('SELECT COUNT(*) as c FROM vehicles').get().c;
if (vehicleCount === 0) {
  const insert = db.prepare(`INSERT INTO vehicles (category, brand, model, year, price, fuel_type, image_url, icon, emi, tags, variants, expert_note, gallery_images, description)
    VALUES (@category, @brand, @model, @year, @price, @fuel_type, @image_url, @icon, @emi, @tags, @variants, @expert_note, @gallery_images, @description)`);
  const samples = [
    { category: 'Car', brand: 'MARUTI', model: 'Swift', year: '2024', price: '₹7.49 L', fuel_type: 'Petrol | AMT', image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Suzuki%20Swift%20(2024)%20hybrid%20IMG%201869.jpg', icon: '🚗', emi: 'EMI ₹13,200/mo', tags: 'NEW,LOAN READY,INSURE', variants: 'LXi, VXi, ZXi, ZXi+, ZXi AMT', expert_note: '', gallery_images: 'https://commons.wikimedia.org/wiki/Special:FilePath/Suzuki%20Swift%20(2024)%20hybrid%20IMG%208936.jpg,https://commons.wikimedia.org/wiki/Special:FilePath/Suzuki%20Swift%20(2024)%20hybrid%20IMG%208820.jpg', description: '' },
    { category: 'Car', brand: 'HYUNDAI', model: 'Creta', year: '2024', price: '₹11.11 L', fuel_type: 'Petrol | DCT', image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/2024%20Hyundai%20Creta%20Alpha.jpg', icon: '🏎️', emi: 'EMI ₹19,600/mo', tags: 'NEW,LOAN READY,INSURE', variants: 'E, EX, S, SX, SX(O)', expert_note: '', gallery_images: '', description: '' },
    { category: 'Car', brand: 'TATA', model: 'Nexon EV', year: '2024', price: '₹14.74 L', fuel_type: 'Electric | Auto', image_url: '', icon: '🚙', emi: 'EMI ₹25,800/mo', tags: 'NEW,LOAN READY,INSURE', variants: 'Creative, Fearless, Empowered', expert_note: '', gallery_images: '', description: '' },
    { category: 'Car', brand: 'MAHINDRA', model: 'Scorpio-N', year: '2024', price: '₹13.99 L', fuel_type: 'Diesel | 4WD', image_url: '', icon: '🚗', emi: 'EMI ₹24,500/mo', tags: 'NEW,LOAN READY,INSURE', variants: 'Z2, Z4, Z6, Z8, Z8L', expert_note: '', gallery_images: '', description: '' },
    { category: 'Car', brand: 'TOYOTA', model: 'Innova Crysta', year: '2024', price: '₹19.77 L', fuel_type: 'Diesel | AT', image_url: '', icon: '🏎️', emi: 'EMI ₹34,600/mo', tags: 'NEW,LOAN READY,INSURE', variants: 'GX, VX, ZX', expert_note: '', gallery_images: '', description: '' },
    { category: 'Car', brand: 'KIA', model: 'Seltos', year: '2024', price: '₹10.90 L', fuel_type: 'Petrol | iMT', image_url: '', icon: '🚙', emi: 'EMI ₹19,100/mo', tags: 'NEW,LOAN READY,INSURE', variants: 'HTE, HTK, HTK+, HTX, GTX+', expert_note: '', gallery_images: '', description: '' },
    { category: 'Car', brand: 'HONDA', model: 'City', year: '2024', price: '₹11.57 L', fuel_type: 'Petrol/Hybrid', image_url: '', icon: '🚗', emi: 'EMI ₹20,200/mo', tags: 'NEW,LOAN READY,INSURE', variants: 'SV, V, VX, ZX', expert_note: '', gallery_images: '', description: '' },
    { category: 'Car', brand: 'VOLKSWAGEN', model: 'Virtus', year: '2024', price: '₹11.56 L', fuel_type: 'Petrol | DSG', image_url: '', icon: '🏎️', emi: 'EMI ₹20,200/mo', tags: 'NEW,LOAN READY,INSURE', variants: 'Comfortline, Highline, Topline, GT', expert_note: '', gallery_images: '', description: '' }
  ];
  const insertMany = db.transaction((rows) => rows.forEach(r => insert.run(r)));
  insertMany(samples);
}

module.exports = db;
