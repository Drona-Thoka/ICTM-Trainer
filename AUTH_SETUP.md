# Authentication email redirects

The app requests confirmation emails returning to
`https://ictm-trainer.vercel.app/` and password resets returning to
`https://ictm-trainer.vercel.app/reset-password`.

In the Supabase project used by this deployment, open **Authentication → URL
Configuration**:

1. Set **Site URL** to `https://ictm-trainer.vercel.app/`.
2. Add these exact entries to **Redirect URLs**:
   - `https://ictm-trainer.vercel.app/`
   - `https://ictm-trainer.vercel.app/reset-password`
3. Save the settings.

These settings are required even though the app supplies a redirect URL.
Supabase may fall back to its Site URL when a requested redirect is not allowed;
the default Site URL points to localhost. Repository changes cannot update the
hosted project's dashboard settings.

If email templates were customized, check **Confirm signup** and **Reset
password**. Their verification link should use `{{ .ConfirmationURL }}` so
Supabase verifies the token and then redirects. A link directly to
`{{ .SiteURL }}` or `{{ .RedirectTo }}` alone does not verify the token.

For a different domain, set `VITE_SITE_URL` in the frontend build environment
(Vercel environment variables or `ictm-reader/.env`) and rebuild. Update the
Supabase settings to match. Invalid URLs, non-HTTP URLs, and localhost overrides
on a deployed public origin fall back to the current website origin.

For local email testing, set `VITE_SITE_URL=http://localhost:5173` and allowlist
`http://localhost:5173/` and `http://localhost:5173/reset-password`.

After deploying and saving the dashboard settings, request fresh confirmation
and reset emails. Existing emails retain their old destinations. Check that
confirmation signs in on the deployed site and that reset opens the password
form and accepts a new password. A successful build does not verify email
delivery or the hosted configuration.

Reference: [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
