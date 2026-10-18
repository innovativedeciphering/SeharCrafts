# seharcrafts.infy.click: storefront and email

The repository is prepared for this custom hostname. A CNAME file or Git push does not by itself activate the custom domain for a GitHub Actions Pages deployment, change external DNS, verify an email domain, or provision HTTPS.

## InfinityFree subdomain prerequisite

The owner manages this address through `https://dash.infinityfree.com/`. Open the relevant hosting account and its control panel to check the available DNS controls before changing GitHub's custom domain. Do not assume that a free hosting subdomain provides the same DNS control as an independently registered domain.

To use the exact requested hostname with GitHub Pages, the provider must permit replacing its hosting/parking mapping for `seharcrafts.infy.click` with the GitHub mapping. Being able to add a CNAME for a child such as `www.seharcrafts.infy.click` does not establish control over the requested bare hostname. Resend additionally needs the exact TXT/MX records it generates at the appropriate child names. A URL forwarding option is insufficient for either DNS verification or a custom-domain TLS certificate.

If those controls are absent, keep the working GitHub Pages URL and Resend test sender until a supported domain is available. Alternatives are a domain with full DNS control for GitHub/Resend, or hosting the built static site on InfinityFree for the website while using another verified domain for email. These alternatives require an explicit hosting decision; no hosting migration has been performed.

## 1. Website DNS

Use the DNS provider that controls `seharcrafts.infy.click` to point that hostname to:

| Type | Host / name | Target |
| --- | --- | --- |
| CNAME | `seharcrafts` if editing the `infy.click` zone | `innovativedeciphering.github.io` |

Some providers expect the full hostname instead of the short label. Do not include `https://`, `/SeharCrafts/`, or a URL path in the DNS target. Replace conflicting A/AAAA/CNAME records only for this hostname, preserving unrelated DNS records. Disable web forwarding/parking for this hostname if the provider offers it. Never remove unrelated mail records.

If `seharcrafts.infy.click` is the root of a separately delegated DNS zone, use the provider's supported ALIAS/ANAME/flattening feature for GitHub Pages, or GitHub's documented apex A records rather than a prohibited root CNAME. The provider must let you configure the hostname; merely having a forwarding URL does not establish DNS control.

## 2. GitHub Pages

1. Open repository **Settings → Pages**.
2. Keep **Source: GitHub Actions**.
3. In **Custom domain**, enter `seharcrafts.infy.click` (no scheme or slash) and Save.
4. Wait for the DNS check and TLS certificate provisioning to finish, then enable **Enforce HTTPS** when available.
5. Run **Deploy Sehar Crafts** on `main` after changing the domain. The workflow reads the Pages metadata to select its base path, retaining the GitHub project path until the custom domain is configured and using `/` afterward.
6. Verify both `https://seharcrafts.infy.click/` and `https://seharcrafts.infy.click/#/owner`, product images, checkout and private order links. Existing GitHub URLs should be checked for the expected redirect.

The CNAME file is in `public/CNAME` and is copied into builds. This prepares the artifact; with a custom Actions workflow, GitHub's custom-domain setting still needs to be saved explicitly.

## 3. Resend sender-domain verification

1. Open Resend → **Domains → Add domain**. Add **`seharcrafts.infy.click`**, with a suitable sending region.
2. Resend will provide account-specific DNS records. Add **exactly** its hostnames, record types, priorities and values at the DNS provider. These typically include DKIM TXT and sending-domain SPF TXT/MX records. Do not guess the DKIM key, copy another account's records or replace existing receiving-mail MX records.
3. Providers may automatically append the zone name. For example, a full host such as `resend._domainkey.seharcrafts.infy.click` may need to be entered as `resend._domainkey` in a zone rooted at `seharcrafts.infy.click`, or `resend._domainkey.seharcrafts` in a zone rooted at `infy.click`. Check the resulting full name to avoid doubling the domain.
4. Click the verification/recheck action in Resend and wait for the domain to show verified. This domain must be under your DNS control, including the required child hostnames. A free-subdomain provider that only permits a single CNAME may support the website but not Resend verification; in that case use a domain with full DNS control for email.
5. If the Resend API key is limited to specific domains, update its sending scope to include the verified domain (or create a suitable sending-only key and update Supabase securely).
6. Only after verification, update Supabase Edge Function secrets:

   ```text
   FROM_EMAIL=Sehar Crafts <orders@seharcrafts.infy.click>
   STORE_URL=https://seharcrafts.infy.click/
   ```

   Keep `RESEND_API_KEY` and `NOTIFICATION_SECRET` private. Configure the owner's actual receiving email in the studio's **Owner notification email** field. The sending domain and the owner's receiving inbox do not have to match.
7. Redeploy the latest `notify-orders` code if needed. Confirm its scheduler, correct shared secret, and outbound email access. Send one owner/customer test and check Resend delivery logs and `notification_events` for successful delivery.

Sending from `orders@seharcrafts.infy.click` does not create an inbox there. Replies go to the owner's saved notification email via Reply-To. Receiving mail at the new domain would require a separate inbox/receiving-mail service.

If Supabase authentication site/redirect URLs still use the GitHub URL, update the **Site URL** to `https://seharcrafts.infy.click/`. Add only exact redirect URLs needed for any enabled recovery or confirmation flows. Current password login does not require a redirect; a password-recovery UI is separate work.

## Current access limitation

The agent can prepare and push repository files, but external settings are not complete until GitHub Pages, the DNS provider and Resend confirm them. Do not infer verification from a successful build. Access to the GitHub API, Resend and this hostname was blocked by the cloud network policy during preparation; the deployment and domain could not be independently verified from that environment.
