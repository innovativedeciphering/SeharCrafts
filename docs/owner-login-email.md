# Change the existing owner's login email

The store supports changing the current owner's email through Supabase Auth's supported `updateUser` API. The dashboard does not need an admin edit-email button, manual writes to `auth.users`, a new user account, or any new owner-table entry.

1. Remain signed into the existing owner account at https://innovativedeciphering.github.io/SeharCrafts/#/owner.
2. In Supabase → Authentication → URL Configuration, set Site URL to `https://innovativedeciphering.github.io/SeharCrafts/` and include this exact URL in the allowed Redirect URLs. This ensures confirmation links return to the store rather than a default localhost address. Keep any other redirect URLs you still use.
3. Open **Account & login** in the store owner dashboard. Enter the new store email and the current account password. Submit **Request email change**. The app verifies the current password, then requests the change on the existing authenticated user.
4. Complete the confirmation messages required by the project's email-change settings. For the requested new-address-only flow, open Authentication → Sign In / Providers → Email, turn **Secure email change OFF**, keep **Confirm email ON**, and save before requesting a fresh change. If Secure email change stays enabled, confirmation is required in both inboxes. This is a Supabase project setting, not something the frontend can override. Check spam folders. Confirmation is sent by Supabase Auth's email service, independently of the order-alert worker. If Supabase reports a mail delivery/rate-limit problem, resolve its Auth email configuration; repeatedly resubmitting the form does not fix that prerequisite. Do not disable confirmation just to bypass delivery problems.
5. Keep the old session open and test the new email with the existing password in a private window after confirmation. The user UUID and entry in `public.owners` stay unchanged, preserving access to the products, orders and owner settings.
6. Separately update **Payment & delivery → Owner notification email**. For Gmail API sending, authorize the actual sending Gmail and update the secure Gmail credentials as described in [Gmail sending](gmail-sending.md). Changing login email alone does not reauthorize Google, change the alert recipient or activate email delivery.

No SQL migration is required. A new login account would have a different UUID and would require separate owner authorization, so do not create a replacement user simply to rename this account.

## Forgot password and change password

- The owner sign-in screen has **Forgot password?**. A signed-in owner can also open **Account & login → Forgot your current password? Send a reset link**, so there is no need to sign out of a saved session just to request recovery. The current login email is prefilled when a session exists. Use the confirmed account login email, not an unconfirmed new address or the notification recipient.
- Add this exact allowed Redirect URL in Supabase Authentication → URL Configuration before requesting a reset:
  `https://innovativedeciphering.github.io/SeharCrafts/?auth=recovery`
  Keep the Site URL and the normal root redirect as `https://innovativedeciphering.github.io/SeharCrafts/`.
- Open the newest reset email. Supabase validates the one-time recovery link; the app requires the resulting recovery event and owner authorization before showing **Set a new password**. A query parameter, a raw reset-page URL or an ordinary saved session alone does not enable the reset form. Tokens are removed from the address bar after processing. Missing/expired links show a request-new-link option.
- Choose and confirm a new store password (8–128 characters; any stricter Supabase project policy also applies). Recovery does not ask for the forgotten password. After success, the recovery browser session signs out locally and the owner signs in again.
- **Account & login → Change password** is for owners who know the current password. It checks that password, verifies matching new passwords, updates the existing Supabase account and clears password inputs after success.
- Supabase Auth sends reset/confirmation emails. The separate Gmail order-alert worker does not deliver these links. Check Auth's email configuration, delivery logs and rate limits if a reset request errors or mail never arrives. A successful API request is not proof of inbox delivery.

If an email callback redirects to `localhost:3000`, correct the project Site URL and Redirect URLs first. The `otp_expired` error requires a fresh link; changing the return URL does not repair an expired or already-used token. A callback message saying a confirmation step was accepted means that step succeeded even if the return page was inaccessible—check the current account state before making another change.
