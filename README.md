# G.Licious Pics — Fine Art Photography & Print Shop

A dark, editorial, responsive photography portfolio and print shop website representing the natural wonders of Hawaiʻi and beyond, captured by photographer Gentry.

Features Cloudinary-hosted images, dynamic sizes/materials price lookups, a native client-side shopping cart (`localStorage`), and a secure **Stripe Checkout** payment integration.

---

## Technical Stack
- **Frontend:** HTML5, vanilla CSS3, client-side JavaScript (ES6)
- **Backend API:** Node.js, Express, Stripe SDK
- **Data Store:** `products.json` (Catalog database)
- **Asset Delivery:** Cloudinary CDN

---

## Local Setup & Development

### 1. Prerequisites
Make sure you have Node.js installed (v18+ recommended).

### 2. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory (based on `.env.example`):
```env
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
PORT=8080
```
*Never commit your real API keys or `.env` files to Git. The `.gitignore` has been pre-configured to ignore `.env` files.*

### 4. Running the Dev Server
To start the server locally:
```bash
npm start
```
The server will start at **[http://localhost:8080](http://localhost:8080)**.

---

## Secure Stripe Checkout Flow
- The site uses an Express backend server ([`server.js`](server.js)) with a `POST /api/checkout` route.
- When a user proceeds to checkout, the server parses the cart, queries the prices directly from `products.json`, and submits the validated details to Stripe. **This prevents client-side price tampering.**
- Stripe collects shipping addresses and credit cards on their secure hosted checkout pages.
- If Stripe keys are not defined in the `.env` file, the site automatically falls back to a mock checkout simulation so that frontend layouts can still be tested.

---

## Project Structure
- `index.html` — Homepage (hero slideshow, category cards, about, contact)
- `pages/`
  - `underwater.html`, `landscapes.html`, `travel.html`, etc. — Gallery masonry pages
  - `product.html` — Dynamic format-aware product details template page
  - `cart.html` — Cart summary and checkout redirect
  - `faq.html` — Frequently Asked Questions
- `js/`
  - `main.js` — Navigation, slider controls, visual animations
  - `cart.js` — Client cart store logic (CRUD operations + badges)
- `css/style.css` — Editorial dark styles stylesheet
- `products.json` — Product metadata database (IDs, titles, starting prices, image assets, options)
- `server.js` — Express API server and static asset hosting code
