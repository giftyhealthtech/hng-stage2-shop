# Maison Étoile

Maison Étoile is a simple luxury fashion e-commerce project designed for a small independent designer. The goal is to present premium products in a clean and elegant storefront while keeping the code beginner-friendly and easy to extend.

## Project goal

This project is a front-end e-commerce website for a boutique fashion brand. It should feel polished, minimal, and premium, with a strong editorial style and a calm luxury aesthetic.

The first version focuses on:
- displaying a curated selection of products
- showcasing product details
- adding products to a cart
- updating cart quantities
- calculating totals
- handling a simple checkout flow
- storing cart data in localStorage

The storefront reads products and saves pending orders in Supabase. Google sign-in and account creation use Supabase Auth. Payment and email are not integrated yet.

## Completed first version

The initial front-end is complete and includes:
- luxury landing page
- product gallery and product detail flow
- cart page and checkout page
- localStorage-based cart persistence
- responsive layout and minimalist styling
- beginner-friendly JavaScript functions

## Technologies used

- HTML
- CSS
- Vanilla JavaScript
- localStorage for cart persistence

## Planned file structure

The project remains intentionally simple and beginner-friendly:

- index.html - home page
- shop.html - product listing page
- product.html - product detail page
- cart.html - shopping cart page
- checkout.html - checkout page
- success.html - order success page
- login.html - login page
- css/styles.css - all styling
- js/data.js - sample product array
- js/main.js - page rendering and cart logic

## Build plan

### Step 1: Project setup
Create the basic HTML pages and CSS structure.

### Step 2: Product data
Add a JavaScript array of sample products with:
- id
- name
- price
- description
- category
- image
- sizes

### Step 3: Home and shop pages
Display a featured collection and a product grid with clear product cards.

### Step 4: Product details
Create a product detail page that reads the selected product from the URL and shows description, price, size options, and add-to-cart actions.

### Step 5: Cart logic
Use localStorage to save the shopping cart. Add functions to:
- add items
- remove items
- update quantity
- calculate totals

### Step 6: Checkout flow
Create a simple checkout page with a form and order summary. On confirmation, redirect to a success page.

### Step 7: Styling and responsiveness
Use a minimalist luxury aesthetic with:
- cream background
- black text
- generous whitespace
- subtle borders
- elegant product photography
- mobile-friendly layout

## Important implementation notes

- No frameworks or build tools are required.
- No complex state management is used.
- No unnecessary abstractions or classes will be introduced.
- The project is built for beginners to read and understand easily.

## Phase 2: Supabase + Stripe + Auth + Email roadmap

After the front-end is stable, the next phase should be implemented in a structured order.

### 1. Supabase setup
- Create a Supabase project
- Add tables for products, categories, orders, and customers
- Store product data in a database instead of the static array
- Add admin-friendly data management for product editing

### Supabase starter structure

The project now includes a basic Supabase starter file at [js/supabase.js](js/supabase.js) and a sample environment file at [.env.example](.env.example).

The storefront fetches products from Supabase and falls back to sample data if the connection is unavailable. Checkout can save pending orders through a database function that recalculates product prices from the database. Payment is not processed yet.

To enable order persistence, run [supabase/orders-tables.sql](supabase/orders-tables.sql) in the Supabase SQL editor after [supabase/products-table.sql](supabase/products-table.sql). Checkout stores customer delivery details and order items; do not store card details in these tables.

### Store admin panel

The product admin page at [admin.html](admin.html) lets an authorized administrator add products, upload product images, edit entries, and delete products. It supports Supabase Google sign-in as well as email/password sign-in. A successful sign-in alone does not grant admin access; product and Storage policies authorize only the user UUIDs allowlisted in `public.admin_users`.

1. Run [supabase/admin-panel.sql](supabase/admin-panel.sql) in the Supabase SQL editor after `products-table.sql`.
2. In Supabase Authentication → URL Configuration, add the admin page URL to the allowed redirect URLs (for local use: `http://localhost:8000/admin.html`; also add your deployed admin URL).
3. Sign in at [admin.html](admin.html) with the Google account you want to authorize. Supabase creates its Auth user on the first successful sign-in.
4. Copy that user’s UUID from Supabase Authentication → Users, then insert it into `public.admin_users` in the SQL editor:

   ```sql
   insert into public.admin_users (user_id)
   values ('YOUR_AUTH_USER_UUID')
   on conflict (user_id) do nothing;
   ```

5. Reload [admin.html](admin.html). The Google account can now access the product manager. Email/password sign-in remains available as an alternative.

The database policies restrict product writes and product-image uploads/deletes to UUIDs in `public.admin_users`. The `product-images` bucket is public so storefront visitors can see product photos; only authorized administrators can manage its files. The frontend must use only the Supabase publishable/anon key, never the service-role key.

### Supabase browser configuration

For local development, put `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the root `.env` file, then start the app with `node server.js`. The server reads `.env` locally and dynamically serves only those two browser-safe settings through `js/config.js`; it does not serve `.env` or other project files. It rejects service-role/secret keys. The `.env.example` file is a reference template.

For Vercel deployment, add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Vercel project environment variables for the Production (and Preview, if needed) environments. `vercel.json` rewrites the browser's `/js/config.js` request to [api/config.js](api/config.js), which exposes only these public client settings and rejects secret/service-role keys. The root `.env` remains local and must not be uploaded or committed.

The browser necessarily receives the Supabase URL and publishable/anon key. These are public client credentials: database access must remain protected by row-level security and the restricted `place_order` database function. Never put a service-role key in frontend code or `.env` used by this server.

For static hosting, configure the host to inject the two public settings during deployment or use an equivalent server-side runtime config endpoint; a browser cannot read `.env` files directly.

### 2. Google login
- Google OAuth is used by the customer login page and is also available on the admin page.
- Configure the Google provider in Supabase Auth and allow the local and deployed page URLs as redirect destinations.
- Admin access still requires applying `supabase/admin-panel.sql` and adding the administrator's Auth user UUID to `public.admin_users`.

### 3. Mailgun email integration
- Send order confirmation emails after checkout
- Add account welcome emails and shipping updates later
- Keep the confirmation flow simple and non-blocking at first

### 4. Stripe payment integration
- Add Stripe checkout or payment intent flow
- Use a secure backend endpoint to create checkout sessions
- Confirm payment before finalizing the order status
- Handle failed or cancelled payment states gracefully

### 5. Recommended project structure for phase 2

The next phase should expand carefully without introducing complexity too early:

- index.html
- shop.html
- product.html
- cart.html
- checkout.html
- login.html
- css/styles.css
- js/data.js
- js/main.js
- api/checkout.js (later for Stripe server logic)
- services/supabase.js (later for database access)
- services/auth.js (later for Google auth)

### 6. Suggested implementation flow

1. Replace static product data with Supabase product fetches
2. Add customer login using Google OAuth
3. Add order save logic after checkout
4. Send order confirmation via Mailgun
5. Integrate Stripe payment and test a full purchase flow
6. Deploy the project to a hosting platform

## Future extension

Once the front-end is stable, the next stage can integrate:
- Supabase for product and order persistence
- Google Cloud login
- Mailgun notifications
- Stripe checkout

These services are intentionally left out of the first version so the design and frontend logic can be built cleanly first.
