# Next Phase Plan: Supabase, Google Auth, Mailgun, and Stripe

## Goal

The first version is a static storefront that helps us design and test the premium boutique experience. The next phase should add real data, customer identity, order confirmation, and secure payments without changing the overall beginner-friendly structure.

## 1. Supabase integration

### Purpose
Supabase will replace the static JavaScript product array with real product data and order storage.

### Suggested setup
- Create a Supabase project
- Add tables:
  - products
  - categories
  - orders
  - order_items
  - customers
- Save each product with:
  - id
  - name
  - price
  - description
  - category
  - image_url
  - sizes

### Implementation plan
- Fetch products from Supabase on the shop page
- Replace local sample data with database data
- Save orders after checkout
- Keep cart logic in localStorage for the frontend until final order confirmation is ready

## 2. Google Cloud authentication

### Purpose
Allow shoppers to sign in and return later to continue their cart or account profile.

### Suggested setup
- Create a Google Cloud project
- Configure OAuth credentials
- Add Google sign-in button to the login page
- Store user session data securely in Supabase or your backend layer

### Notes
- Keep login simple at first
- Do not build more than one auth route in the first iteration

## 3. Mailgun email notifications

### Purpose
Send confirmations after placing an order.

### Suggested flow
- Trigger an email after successful checkout
- Send order confirmation to the customer
- Optionally notify the boutique owner when a new order is placed

### First version recommendation
- Keep email logic simple and focused on confirmation only
- Add shipping or order status emails later

## 4. Stripe payment integration

### Purpose
Allow customers to pay securely for their purchases.

### Suggested flow
- Create a checkout session in a backend endpoint
- Redirect the shopper to Stripe Checkout
- Listen for successful payment events
- Update the order status to paid

### Important notes
- Stripe should be introduced only after the shopping flow is stable
- Do not connect payment during the initial beginner version

## 5. Implementation order

1. Replace static product data with Supabase data
2. Add Google sign-in
3. Save orders in Supabase
4. Send order confirmation via Mailgun
5. Integrate Stripe payment flow
6. Test full purchase workflow end-to-end
7. Deploy for public access

## 6. Recommended caution

Keep the database, auth, and payment layers separate and simple. The goal is to move from a design prototype to a working storefront without introducing unnecessary complexity too early.
