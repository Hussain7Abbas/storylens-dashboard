# Story Lens Dashboard

Admin dashboard for [Story Lens](https://storylens.iscoded.com): manage dashboard and reader accounts, roles and their per-endpoint permissions, the novel catalogue and runtime configs.

- Production: https://storylens-dashboard.iscoded.com
- API: the Story Lens backend's `/api/admin` routes (`storylens-backend`).
- Part of the [Story Lens umbrella repository](https://github.com/Hussain7Abbas/storylens) at `apps/dashboard`.

## Access model

One account (one email, username and password) can have **reader access** (`isUser`: the extension, website and desktop client) and/or **dashboard access** (`isAdmin`: this dashboard), with a **role** for each. A role is a list of **permissions**. Sign-in tokens are issued per API, so a reader token never opens the dashboard. The backend creates one permission per API endpoint (`GET /api/admin/users/`, `POST /api/user/keywords/`, …) plus the `user:moderate` capability, and syncs them from its routes on startup. The seeded **Super Admin** role always holds every dashboard permission.

The dashboard has no sign-up. The backend seed gives `DASHBOARD_ADMIN_EMAIL` super-admin dashboard access (`make seed-dashboard-admin` in the backend): an existing reader account with that email keeps its password and reader access; otherwise a dashboard-only account is created from `DASHBOARD_ADMIN_USERNAME` and `DASHBOARD_ADMIN_PASSWORD`. Everyone else gets dashboard access on the Users page.

Novel covers and keyword, alias and version images use a 100px drag-and-drop uploader with a centered upload icon, click or keyboard selection, drag feedback, preview and a delete button. Uploads accept one image up to 8 MB and require the image-upload permission. Images upload immediately; save the form to keep the new image or its removal. Failed uploads preserve the previous image.

## Development

```bash
cp .env.example .env      # VITE_API_URL=http://localhost:3030
bun install
bun run dev               # http://localhost:3040
```

Run the backend locally (`make dev` in `storylens-backend`). Other commands:

| Command                                                         | Purpose                                                                                                                                                                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck` / `bun run lint`                            | TypeScript and Biome                                                                                                                                                                                                              |
| `bun run build`                                                 | Static build in `dist/`                                                                                                                                                                                                           |
| `bun run test`                                                  | Playwright + axe tests with a mocked API                                                                                                                                                                                          |
| `bun run test:e2e -- --project=chromium tests/live-api.spec.ts` | Opt-in test against a built dashboard, loopback API and disposable seeded PostgreSQL database; set `STORYLENS_E2E_API_URL`, `STORYLENS_E2E_ADMIN_EMAIL` and `STORYLENS_E2E_ADMIN_PASSWORD` (see the umbrella `docs/dashboard.md`) |
| `bun run orval`                                                 | Regenerate `src/api/generated/` from a running backend (`ORVAL_API_URL`)                                                                                                                                                          |
| `make sync`                                                     | On the server: pull `main`, build and activate a release                                                                                                                                                                          |

## Deployment

The server checkout lives at `/srv/storylens-dashboard` on branch `main`. As root, `make sync` builds with Bun (Vite runs on the Node LTS in `/opt/storylens-node/bin`), copies `dist/` into a timestamped release under `/var/www/storylens-dashboard/releases`, swaps the `current` symlink, installs the Nginx site from `deploy/nginx/`, requests a Let's Encrypt certificate on the first run, checks `https://storylens-dashboard.iscoded.com/login` and rolls back on failure. The DNS record is a proxied Cloudflare A record to the same server as the website.

`.github/workflows/deploy.yml` deploys the dashboard after the backend. When the backend's review-version watcher finishes a successful `make sync`, it sends a `backend-deployed` event to this repository. The workflow then sends `main`'s SHA over a command-restricted SSH key, and the server's `deploy/ci-ssh.sh` wrapper checks out that commit and runs `make deploy`. Pushes to `main` don't deploy on their own, and the workflow runs no checks, so run them locally first. To deploy by hand, run `gh workflow run deploy.yml -R Hussain7Abbas/storylens-dashboard` or `ssh raseen 'cd /srv/storylens-dashboard && make sync'`.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md). The vendored UI UX Pro Max skill in `.claude/skills/ui-ux-pro-max` is MIT-licensed (see its `LICENSE`).

Settings → AI includes separate prices and limits for character images and cinematic chapter covers, both using the configured image model. Cover estimates include the longer chapter-context brief.

Settings → AI includes reasoning effort and extra token allowance for text/image briefs, plus image quality for portraits and chapter covers. Options follow the selected model’s capabilities and save to backend Configs for the next Cloud action. Reasoning increases the combined thinking/answer budget and estimated cost. Quality-specific image costs are shown as unavailable where OpenRouter provides no reliable token estimate; Auto/medium prices remain labelled baseline estimates.


Settings → AI includes **Available lens balance**, stored as the `AI_Lens_Balance` Config (0–999,999,999 whole lenses, absent means zero). The dollar converter uses `Lens_Price_USD` and exact integer micro-dollars, rounding fractional lenses down. Saving replaces the remaining stock; it does not add a top-up or fetch the OpenRouter balance. Approved sales and dashboard gifts deduct stock atomically on the backend; reader AI spending, refunds, trial gifts and corrections leave it unchanged. Gift and sale dialogs validate against the available stock when Config read access is present; the API always enforces it. Config permissions gate the balance card and edits. Set the initial stock before approving sales or issuing gifts. Balance edits include `baseUpdatedAt`; a concurrent deduction keeps the draft visible and requires **Reload balance** before saving again.

The text/image model picker is an editable combobox with search inside the selected-value control, Arrow keys, Enter and Escape. Feature editing is opened by a pencil in the cost table’s final **Actions** column and saves the existing pricing form in a modal; roles without model-list permission still see the feature table and can edit when allowed by pricing permissions.

Novel profiles have **Characters** (default) and **Chapters** tabs (`?tab=chapters`, with keyboard navigation). Chapters paginate the admin chapter endpoint and show artwork thumbnails, number, name and updated date. Opening a row fetches the scoped detail endpoint and shows the full background image with structured chapter context beneath it, including observations and lasting changes. Context is absent from chapter list responses. New chapter-list and chapter-detail permissions independently gate these views; private generation reservations are never returned.


Keyword and alias create/edit dialogs include a collapsed **Advance** section with **Main Theme Color**: a hex field, native color picker and **Use inherited color** reset. Save nullable `mainThemeColor` through the existing keyword/alias API; reject non-six-digit hex colors. It overrides the word’s category color and is shared with readers; blank aliases inherit their keyword’s override first. Opening or switching language tabs preserves the draft, and existing edit permissions still apply. Backend deployment needs the additive `main_theme_color` migration.


Settings → **Categories** (`?tab=categories`) lists shared categories with Word VFX and optional tint. The pencil opens an editor with None, Sparkles, Heat, Shaking, Glitching and Glare; Heat/Sparkles offer a hex field/native color picker and **Use word color** reset. Read access uses `GET /api/admin/keyword-categories/`; edits require the separate `PUT /api/admin/keyword-categories/:id` permission. Saves send `baseUpdatedAt`, nullable `wordVfxColor` and `wordVfx`; errors retain the draft, and reopening reloads the current category after a stale write. Category VFX is used when the reader’s keyword/alias has no explicit effect, after chapter/alias category resolution. The legacy `effect` field is not edited. Deploy backend migration `20261017213830_category_word_vfx` first.

Glare is stored as `GLARE` and has no tint picker. It needs backend migration `20261017214616_glare_word_vfx`; reader and admin clients include the new WordVfx enum value.

Category editing in Settings → Categories also exposes **Switch position with nature**, default false. Save `switchPositionWithNature` with the existing category update permission and revision precondition. Readers then use nature color for word text and category color for the circle, with explicit Main Theme Color overrides preserved. The backend needs migration `20261017215230_category_swap_colors`.
