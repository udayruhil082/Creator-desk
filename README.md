# My Creator Desk

Influencer marketing desk for the team: look up Instagram creators by handle, upload a creator sheet and fill the blanks from Instagram, spot competitor collabs, shortlist and share with a manager, and track campaign posts (CPV, CPE, ER, budget).

- `index.html` is the whole website (static, hosted on Netlify).
- Data and the Instagram token live in the team's Google Sheet and its Apps Script project (`apps-script/`). The token is never stored in this repo.
- The website talks to the Apps Script web app at the `API_URL` set near the top of the page script.

## New backend (Supabase + Razorpay)
The multi-company backend (companies, admins and members, plans, Razorpay billing with manual approval, each company's own Instagram connections, usage per member) is in `supabase/`. See `supabase/README.md` for the security model, setup and API. The website still uses the Apps Script backend until the frontend is moved over.

## Updating
Push to `main`; Netlify redeploys automatically.
