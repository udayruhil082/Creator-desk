# My Creator Desk

Influencer marketing desk for the team: look up Instagram creators by handle, upload a creator sheet and fill the blanks from Instagram, spot competitor collabs, shortlist and share with a manager, and track campaign posts (CPV, CPE, ER, budget).

- `index.html` is the whole website (static, hosted on Netlify).
- Data and the Instagram token live in the team's Google Sheet and its Apps Script project (`apps-script/`). The token is never stored in this repo.
- The website talks to the Apps Script web app at the `API_URL` set near the top of the page script.

## Updating
Push to `main`; Netlify redeploys automatically.
