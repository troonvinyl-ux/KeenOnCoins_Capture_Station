# MyGab TV — Fire Stick web app prototype

A TV-first video feed for Fire TV, using provider-hosted players.

## Publish to GitHub Pages
A workflow at `.github/workflows/deploy-mygab-tv.yml` deploys this folder to GitHub Pages when `mygab-tv/**` changes or when manually started.

1. Open the repository's **Settings → Pages**.
2. If prompted, allow GitHub Actions as the Pages build/deployment source.
3. Open **Actions → Deploy MyGab TV**, then select **Run workflow** if the first deployment did not start automatically.
4. When the deployment succeeds, GitHub displays the site URL in the workflow's deployment environment. It will usually resemble `https://troonvinyl-ux.github.io/KeenOnCoins_Capture_Station/`.

## Controls
- Fire TV remote Up/Down, Page Up/Page Down, Enter, Space: previous/next video.
- Touch swipe and mouse wheel also navigate.
- Admin button or A key opens PIN prompt.
- Prototype PIN: `1802`.
- In Admin, save keywords then use **Search YouTube** to open provider search results. Add a chosen video by pasting its original URL; YouTube watch and Shorts links are converted to embed URLs automatically.
- Settings and manually added video links are stored in that browser's localStorage.

## Current capabilities and limitations
- Video feed, navigation, admin UI, keyword storage, provider search links, add/remove links, and demo embeds are implemented.
- Automated discovery/import of search results is not yet connected. It needs a server-side search integration (for example, YouTube Data API or another permitted provider), with API credentials kept on the server. A static web page must not contain a private API key.
- Playback uses the original platform's embed player; this app does not download or rehost third-party videos.
- The PIN is a local prototype gate, not secure public-site authentication. Before public use, add server-side authentication and storage, and protect admin actions. This PIN does not bypass provider age restrictions, account limitations, or local law.
