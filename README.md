# Heliora Diagnostic — GitHub & Cloudflare-ready website

A responsive static website recreated from the previously developed Heliora Diagnostic site concept. No build tools or paid hosting required.

## Preview locally
Open `index.html` in a browser, or run `python -m http.server 8000` in this folder and visit `http://localhost:8000`.

## Upload to GitHub
1. Create a new GitHub repository (e.g. `heliora-diagnostic`).
2. Upload `index.html`, `assets/`, `README.md`, and `.gitignore` to the repository root.
3. Commit changes.

## Deploy to Cloudflare Pages
1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Select the repository and branch.
3. Framework preset: **None**; Build command: **leave blank**; Build output directory: **/** (repository root, if requested).
4. Deploy. Check the generated `*.pages.dev` preview before connecting your custom domain.
5. Add `www.helioradiagnostic.com` as a custom domain only after verifying DNS records.

**IMPORTANT:** Preserve existing Google Workspace MX, SPF, DKIM and DMARC DNS records. Do not replace or delete email records when connecting the domain.

## What works
- Responsive homepage, services, visit information, wellness section, FAQs, navigation
- Service category filters, expandable FAQs and mobile menu

## What is not yet implemented
- Appointment submission, CMS/admin, patient login, medical reports, live prices, confirmed location or contact information
- This is a **public informational website**, not a healthcare backend. Do not collect patient medical data through an unsecured form.

## Images & branding
- Current photography loads from Unsplash URLs and requires internet access; replace with appropriately licensed, locally stored clinic imagery before final publication.
- Logo is a typographic placeholder. Replace with the approved Heliora logo file when available.
- Confirm service availability, prices, address, contact details, legal/privacy content before going live.

## Licence
Original recreation code supplied for Heliora Diagnostic. External images/fonts remain subject to their respective licences.
