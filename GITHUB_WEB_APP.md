# SWISH Coin Dev Lab — GitHub Web App

This is a development duplicate of the existing SWISH coin application. It keeps the existing React Native/Expo code and existing SWISH backend connection, but is prepared for a web deployment through GitHub Pages.

## No Bash/Terminal needed for normal use

1. Create a GitHub repository for this project.
2. Upload the contents of this folder to the repository's `main` branch.
3. Open **Settings → Pages** and set the source to **GitHub Actions**.
4. Open **Actions** and let **SWISH Coin Dev Lab — GitHub Pages** run.
5. When it finishes, GitHub will show the live Pages URL.

The workflow builds the Expo web version automatically whenever `main` changes.

## Important

The app uses the existing SWISH/OnSpace Supabase backend. The browser contains only the public Supabase URL and anonymous client key. Never add eBay client secrets, access tokens or refresh tokens to this project.

## Development purpose

Use this copy for safe experimentation with:

- identification engine
- valuation engine
- live eBay taxonomy
- eBay listing generator
- eBay submission
- image handling
- commercial score
- learning from actual sales

Proven changes can then be moved into the production SWISH application.
