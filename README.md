# MK Finance — Dynamic Website + Admin Panel

## Aa package ma su chhe
- `public/index.html` — Tamaru main website (same design, have j dynamic)
- `public/admin/index.html` — Admin panel (login, inquiries, vehicles manage)
- `server.js`, `db.js` — Backend (Node.js + Express + SQLite database)
- Database automatic banse chhe first run par (`data/mkfinance.db`)

## Admin Login (default)
- URL: `yourdomain.com/admin`
- Username: `admin`
- Password: `mkfinance@123`

⚠️ **Pehla login karya pachi Settings tab ma jai ne password change kari levu — jaruri chhe.**

## Su su Dynamic chhe
1. **Contact Form** — Website par koi form submit kare etle sidhu database ma save thay, admin panel na "Inquiries" tab ma dekhay
2. **Vehicle Listings** — Homepage na "Cars" tab ma je vehicles dekhay chhe te admin panel thi j control thay chhe (add/edit/delete karo, tarat j website par update thai jashe)
3. **Inquiry Status** — Dareek inquiry ne New / Contacted / Closed mark kari shakay chhe

## ⚠️ Ek Vastu Baki Chhe
Tamari design file ma `MK_FINANCE_LOGO.png` logo reference chhe, pan logo file upload nathi thai. Website chalu rakhva mate:
- Tamaru actual logo file mane moklo, hu website ma add kari deu
- Athva temporary text-logo rakhi shakay chhe (have j "MK Finance" text dekhay chhe jya logo load nathi thatu)

## Hosting kya karvu (Live karva mate)

Aa ek full Node.js backend website chhe (static HTML nathi), etle simple hosting (jem GoDaddy/Hostinger na basic shared hosting) ma nahi chalse. Aa mate options:

### Option 1: Render.com (Recommended — Easy, Free tier available)
1. Render.com par account banavo
2. "New Web Service" > aa folder no code GitHub par upload karo, pachi Render ma connect karo
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Deploy — 2-3 minute ma live thai jashe, free `.onrender.com` URL malshe
6. Pachi tamaru custom domain (jem mkfinance.in) connect kari shakay

### Option 2: Railway.app / Vercel / Hostinger VPS
Same process — jya pan Node.js support hoy tya deploy thai shake.

### Hu potej deploy kari apu?
Jo tame chaho to hu step-by-step deploy pan kari apu — mate mane aa joiye:
- Render.com nu login (aa banavvu free chhe, 2 minute) — athva
- Tamaru GitHub account (code upload karva mate)

Jo aa banavva ma help joiye to kaho, hu guide kari apu.

## Local par test karvu hoy to
```
npm install
node server.js
```
Pachi browser ma `http://localhost:3000` kholo.

---
Koi pan sawal hoy to puchi shako — aakhu system ready ane tested chhe.
