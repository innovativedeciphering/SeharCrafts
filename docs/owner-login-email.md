# Change the existing owner's login email

The store supports changing the current owner's email through Supabase Auth's supported `updateUser` API. The dashboard does not need an admin edit-email button, manual writes to `auth.users`, a new user account, or any new owner-table entry.

1. Remain signed into the existing owner account at https://innovativedeciphering.github.io/SeharCrafts/#/owner.
2. In Supabase → Authentication → URL Configuration, set Site URL to `https://innovativedeciphering.github.io/SeharCrafts/` and include this exact URL in the allowed Redirect URLs. This ensures confirmation links return to the store rather than a default localhost address. Keep any other redirect URLs you still use.
3. Open **Account & login** in the store owner dashboard. Enter the new store email and the current account password. Submit **Request email change**. The app verifies the current password, then requests the change on the existing authenticated user.
4. Complete the confirmation messages required by the project's email-change settings. Secure email change normally confirms both the old and the new addresses. Check spam folders. Confirmation is sent by Supabase Auth's email service, independently of the order-alert worker. If Supabase reports a mail delivery/rate-limit problem, resolve its Auth email configuration; repeatedly resubmitting the form does not fix that prerequisite. Do not disable confirmation just to bypass delivery problems.
5. Keep the old session open and test the new email with the existing password in a private window after confirmation. The user UUID and entry in `public.owners` stay unchanged, preserving access to the products, orders and owner settings.
6. Separately update **Payment & delivery → Owner notification email**. For Gmail API sending, authorize the actual sending Gmail and update the secure Gmail credentials as described in [Gmail sending](gmail-sending.md). Changing login email alone does not reauthorize Google, change the alert recipient or activate email delivery.

No SQL migration is required. A new login account would have a different UUID and would require separate owner authorization, so do not create a replacement user simply to rename this account.
