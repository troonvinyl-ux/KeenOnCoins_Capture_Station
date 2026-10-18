# MyGab TV — Fire Stick web prototype

A standalone TV-first, remote-navigable short-video feed prototype.

## Run locally
Open `index.html` in a modern browser, or host the `mygab-tv` folder on a static web host. For Fire TV, open the hosted HTTPS URL in a browser that supports video embeds.

## Controls
- Up / Down, Page Up / Page Down, Space, or Enter: previous / next video
- Admin button or A key: PIN prompt
- Admin PIN in this prototype: `1802`
- Add video: paste a video URL and (for sources requiring it) an embeddable player URL

## Current scope / important limits
- Stores settings and manually added video links in browser localStorage.
- Includes demo YouTube embeds.
- Keyword/category configuration UI is present, but automated discovery/search is not wired up. It needs a server-side provider (such as a video platform API or permitted feed) and credentials stored server-side.
- The PIN prompt is a local prototype gate, not strong security. Never expose this version publicly as a secure admin system. A hosted production version should authenticate admin actions server-side and protect settings behind server-side authorization.
- Videos should play via their original provider's supported embed/player; this project doesn't download or rehost third-party videos.
- PIN unlock does not bypass age restrictions, account limitations, provider policies, or local law.

## Hosting
Enable GitHub Pages for this repository and use `/mygab-tv/` as the path, or publish this folder to an HTTPS static host. The main repository is a development repository, so the Pages site needs enabling in repository settings before the URL is live.
