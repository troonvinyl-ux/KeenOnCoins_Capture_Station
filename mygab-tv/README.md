# MyGab TV — Fire Stick web app prototype

A TV-first video feed for Fire TV, using provider-hosted players.

## Publish to GitHub Pages
A workflow at `.github/workflows/deploy-mygab-tv.yml` deploys this folder to GitHub Pages when `mygab-tv/**` changes or when manually started.

1. Open repository **Settings → Pages** and ensure GitHub Actions is the Pages source.
2. Open **Actions → Deploy MyGab TV** and run the workflow if it has not started automatically.
3. When deployment succeeds, GitHub shows the live URL. It will usually resemble `https://troonvinyl-ux.github.io/KeenOnCoins_Capture_Station/`.

## Controls
- Fire TV remote Up/Down, Page Up/Page Down, Enter, Space: previous/next video.
- Touch swipe and mouse wheel also navigate.
- Admin button or A key opens PIN prompt.
- Prototype PIN: `1802`.
- In Admin, save keywords to open YouTube search results.
- **Scrape videos from URLs:** paste one or more public webpage URLs into the source scan field and select **Scan URLs for videos**. The app requests a readable text version through the Jina Reader service, extracts supported YouTube, Vimeo, and direct MP4/WebM/OGG links, then adds new links to the feed. Saved source URLs are restored when Admin is reopened.
- Add videos manually by pasting their original URL; YouTube watch and Shorts links are converted to embed URLs automatically.
- Settings and manually added links are stored in that browser's localStorage.

## Scraping limitations and safety
- URL scanning is best-effort. Some sites block readers, require login, load video links only with JavaScript, or prohibit automated access. Such pages may return no results. Respect each website's terms, robots policies, copyright, and access restrictions; do not use this to bypass logins, paywalls, DRM, age gates, or provider restrictions.
- URL scanning sends the entered URL to the third-party Jina Reader service to obtain readable page text. Do not submit private URLs or URLs containing access tokens.
- The current implementation runs in the browser and uses a third-party reader, not a private server. A production-grade setup should use a controlled server-side connector, rate limits, and secure admin authentication.
- Video playback uses the original provider's embed player; this app does not download or rehost third-party videos.
- The PIN is a local prototype gate, not secure public-site authentication. Before public use, add server-side authentication and storage. The PIN does not bypass provider age restrictions, account limitations, or local law.
