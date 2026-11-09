# End-to-end tests (Playwright)

```sh
npm run test:e2e              # run everything (headless)
npm run test:e2e:ui           # interactive runner
npx playwright test auth      # one file
npx playwright show-report    # last HTML report
```

First time on a machine: `npx playwright install chromium`.

The suite starts its own `next dev` on port 3100 (`E2E_PORT` to change it), so it
can run next to your normal dev server. That server uses:

- `.data-e2e/` instead of `.data/`, wiped at the start of every run;
- `.next-e2e/` as its build folder;
- a closed SMTP port, so no email is ever sent. Tests open verification and
  reset links by reading `.data-e2e/users.json`;
- PayPal **Sandbox** with the credentials in `.env`. Checkouts are created but
  never approved, and pending subscriptions are cancelled again.

`paypal-approval.spec.ts` logs in on PayPal's Sandbox pages and pays. It is
skipped unless you pass a Sandbox **personal** account:

```sh
E2E_PAYPAL_BUYER_EMAIL=sb-…@personal.example.com E2E_PAYPAL_BUYER_PASSWORD=… npm run test:e2e -- paypal-approval
```

Its selectors depend on PayPal's page markup and may need updating if PayPal
changes it.
