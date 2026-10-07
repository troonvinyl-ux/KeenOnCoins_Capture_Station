SWISH GITHUB FLAT WEB APP
==========================

This build is deliberately flat so the files can be uploaded individually to GitHub from a phone.

FILES
-----
1. index.html
2. swish.css
3. swish.js

The supplied TXT files contain the exact contents.

INSTALL
-------
Rename:
  SWISH_GitHub_index.html.txt -> index.html
  SWISH_GitHub_swish.css.txt  -> swish.css
  SWISH_GitHub_swish.js.txt   -> swish.js

Put all THREE files in the ROOT of the GitHub repository.
Do NOT put them in a folder.

BACKEND
-------
The frontend uses the existing SWISH OnSpace backend:
  https://iwgaqieyoahmcjfziwga.backend.onspace.ai

It does NOT create a database.
It does NOT create Edge Functions.
It does NOT replace the existing SWISH backend.
It does NOT contain eBay client secrets, access tokens, refresh tokens, Gemini keys or Numista secrets.

PUBLIC ANON CONFIG
------------------
The code contains the SAME public Supabase-compatible anon key that was already present in the supplied SWISH GitHub HTML.
This is a public client key, not an eBay/Gemini/Numista secret. It is required by the existing Supabase-compatible backend for browser requests.
No additional API keys should be added.

AI / LEARNING
-------------
The frontend calls the existing backend AI layers rather than implementing a new AI model in the browser.

Supported calls include:
  identify
  value
  swish-identify (fallback)
  swish-islamic-identify
  swish-market-value (valuation fallback)
  swish-decompose
  swish-list-generate

The frontend passes existing item images, attributes, identification confidence and Numista-related fields to the backend where appropriate.
It does not invent market values or identification results.

EBAY
----
The frontend calls the existing backend eBay functions where available:
  ebay-auth-url
  ebay-sync
  ebay-sync-listings
  ebay-offer-action
  ebay-return-action
  ebay-case-respond
  ebay-reply-message
  ebay-finances
  ebay-finances-summary
  ebay-analytics
  ebay-import-csv
  ebay-export-csv
  listing-preflight
  publish-listing
  dispatch-order
  reprice
  reprice-all

SIMPLE DELIVERY
---------------
eBay listing creation uses SIMPLE_DELIVERY when the existing listing generator accepts the delivery field.

IMPORTANT
---------
Do not add API keys to the HTML or JavaScript.
Do not add eBay credentials to the frontend.
Do not add Gemini credentials.
Do not add Numista credentials.
Do not create another database.
Do not create another authentication system.
Do not move private credentials into the browser.

GitHub Pages should serve index.html from the repository root.


CATEGORY MANAGER
----------------
The eBay Hub now includes Category Manager. It lists existing SWISH inventory, shows the stored eBay category, allows a category ID/name to be selected from category data already present in the existing SWISH database or entered manually, optionally asks the existing identification AI for a category suggestion, and saves the confirmed category to the existing inventory/eBay listing records.

The supplied frontend deliberately does not claim an eBay-side revision succeeded unless an existing secure backend revision action accepts the request. The supplied backend function list did not contain an eBay category-revision function, so no new Edge Function or credential handling was added.
