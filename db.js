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
  variants TEXT,                  -- comma separated "Name:Price" pairs e.g. "LXi:Rs 6.49 L, VXi:Rs 7.19 L, ZXi:Rs 7.99 L" (price optional after colon)
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
    { category: 'Car', brand: 'MARUTI', model: 'Swift', year: '2024', price: '₹6.49 L - ₹8.99 L', fuel_type: 'Petrol | MT/AMT', image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Suzuki%20Swift%20(2024)%20hybrid%20IMG%201869.jpg', icon: '🚗', emi: 'Starting ₹12,200/mo', tags: 'NEW,LOAN READY,INSURE', variants: 'LXi:₹6.49 L, VXi:₹7.29 L, VXi(O):₹7.56 L, ZXi:₹8.29 L, ZXi+:₹8.99 L', expert_note: 'EXTERIOR: The 4th-gen Swift gets a fresh face with sleeker LED projector headlamps, LED DRLs, a gloss-black front grille and new 15-inch diamond-cut alloy wheels on top trims. Two new colours (Lustre Blue, Novel Orange) join the existing palette, with dual-tone roof options on select variants.\n\nINTERIOR: The cabin now houses a bigger 9-inch touchscreen with wireless Android Auto/Apple CarPlay, a redesigned dashboard, wireless phone charging, and 60:40 split rear seats. Boot space stands at 265 litres, adequate for a family hatchback.\n\nSAFETY: 6 airbags, ESP, hill-hold assist, ISOFIX mounts and a rear parking camera are standard across the range — a notable step-up from the outgoing model where these were limited to higher trims.\n\nENGINE & MILEAGE: The new 1.2L Z-Series 3-cylinder petrol engine (80bhp/112Nm) with 5-speed MT or AMT returns an ARAI-claimed mileage of up to 25.75 kmpl (AMT), among the best in its segment. An S-CNG option is offered on select trims for even lower running costs.\n\nMK FINANCE VERDICT: For buyers prioritising low running costs, easy city driving and strong resale value, the Swift remains one of the safest bets in the hatchback segment — and with 6 airbags now standard, it ticks the safety box too.', gallery_images: 'https://commons.wikimedia.org/wiki/Special:FilePath/Suzuki%20Swift%20(2024)%20hybrid%20IMG%208936.jpg,https://commons.wikimedia.org/wiki/Special:FilePath/Suzuki%20Swift%20(2024)%20hybrid%20IMG%208820.jpg', description: 'The 2024 Maruti Suzuki Swift is the 4th-generation model of India\'s best-selling premium hatchback, launched in May 2024. It comes with a new 1.2-litre Z-Series 3-cylinder petrol engine producing 80bhp and 112Nm of torque, paired with a 5-speed manual or 5-speed AMT gearbox, delivering an ARAI-claimed mileage of up to 25.75 kmpl. Standard features across the range include 6 airbags, ESP, hill-hold assist, a rear parking camera, and a 9-inch touchscreen infotainment system with wireless Android Auto/Apple CarPlay on higher trims. Higher variants add a wireless phone charger, automatic climate control, cruise control, and Suzuki Connect app-based connected features. An S-CNG option is also available on select trims.' },
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
