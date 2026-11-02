# Run button installs missing packages

## Prompt

> Can you add the npm install to our code or is that purely a replit thing?

(After the Xpoz merge, the Replit preview showed "Couldn't reach Xpoz"
because the new `@xpoz/xpoz` package was never installed: the deploy routine
of fetch, reset, Stop, Run only updates code.)

## What changed

- `.replit`: the Run button (the `run` line and the `Start application`
  workflow) now runs `npm install --omit=dev --no-audit --no-fund` before
  `PORT=5000 npm start`. When nothing changed it finishes in a second or two.
  `--omit=dev` skips the test tools, which need Node 22 and never run on
  Replit anyway.
- A `;` rather than `&&` joins the two, so if the install fails for a passing
  reason (a network blip) the app still starts with what's installed.
- The published site's command is unchanged: its build step already runs
  `npm ci --omit=dev`, and installing again on every cold start would slow it.
- README and replit.md say Run now handles installs.
