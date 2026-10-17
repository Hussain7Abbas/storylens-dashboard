# Story Lens dashboard design system

The dashboard uses the **Ink & Iris** identity defined in the website repository (`design-system/MASTER.md` there, mirrored in umbrella `docs/branding/`). This file records only how the admin surface applies it.

## Direction

A UI UX Pro Max query (`admin dashboard user management roles permissions --design-system --density 8 --variance 3 --motion 2`) recommended *Minimalism & Swiss Style*: grid-based, functional, high contrast, subtle motion, dense spacing. We keep that structure and reject its palette (dark slate with green accent) and fonts (Fira) in favour of Ink & Iris and Inter, as the website's MASTER requires.

## Tokens

`src/styles/globals.css` copies the website's light/dark values (canvas `#f7f7fb`/`#171820`, surface, ink, muted, border, iris accent `#6554c0`/`#b5a8f5`, accent soft, wash, success, error, warning) and exposes them to Tailwind as `paper`, `surface`, `ink`, `muted`, `line`, `accent`, `accent-soft`, `wash`, `success`, `danger`, `warning`. Do not hard-code colours in components. Theme preference (system, light, dark) sets `data-theme` on `<html>`, like the website.

## Layout and components

- 16rem sidebar on large screens, a top bar with a drawer below `lg`; content max width 72rem.
- Controls use the 0.65rem control radius, cards 1rem with the small shadow. Primary actions are solid iris; secondary actions are neutral; destructive actions use the error colour and always confirm first.
- Tables sit inside cards, scroll horizontally inside the card on small screens, and use uppercase muted headers, row hover wash and tabular numbers.
- Badges: iris for dashboard/portal emphasis, warning for missing data (no role, no AI context), neutral otherwise. HTTP methods in the permission matrix use GET success, POST accent, PUT warning, DELETE error, always with the method text so colour is not the only signal.
- Forms keep visible labels, hints and inline errors (`Field`), native dialogs with Escape and focus return, and toasts announced through an `aria-live` region.

- Lookup add/edit forms in Settings show two fixed evaluation surfaces together: light canvas/ink `#f7f7fb`/`#202132`, dark canvas/ink `#171820`/`#eeeff6`. These deliberately stay fixed across dashboard themes and preserve chosen colors in forced colors so admins can evaluate the same color on both. They are the exception to theme-relative component colors; explanatory labels and numeric contrast feedback remain readable independently of the chosen color.
