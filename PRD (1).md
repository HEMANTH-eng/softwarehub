# Product Requirements Document (PRD)
## Windows Software Download Website

---

## 1. Overview

A simple, clean website where users can browse, search, and download Windows software. No user accounts or authentication for the public site. An admin panel (separately protected) manages software listings, categories, ad/monetization settings, and basic analytics. The site monetizes through Adsterra ad units, placed using a strategy that keeps user experience clean and non-intrusive.

---

## 2. Goals

- Let visitors discover software by category or search, with zero friction (no login).
- Provide a clear software detail page before download.
- Give a simple, honest download experience (loader + direct link + related suggestions).
- Monetize through ads without feeling spammy — protect user trust and repeat visits.
- Give the site owner an easy way to add/edit/remove software, categories, and ad settings, plus see basic stats.
- Keep the UI minimal, clean, fast, and fully responsive (mobile + desktop).
- Keep the whole application configurable through a single `config.json` file.
- Deployable on shared hosting (cPanel) using Node.js + SQLite (no external DB server).

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Frontend markup/styling | HTML + Tailwind CSS |
| Frontend interactivity | Vanilla JavaScript |
| Component library | Lightweight reusable HTML component/partials, Tailwind-based (no heavy JS framework) |
| Icons | Minimal icon set (e.g. Lucide/Feather-style). No emojis anywhere in the UI. |
| Backend | Node.js (Express) |
| Server entry point | `server.js` (single entry point to run the whole app) |
| Database | SQLite (file-based, stored in project directory) |
| File storage | Local `/storage` folder (software files, icons/screenshots) |
| App configuration | `config.json` (site settings, ad settings, paths, limits) |
| Ad network | Adsterra (Popunder, Native Banner, Banner, Smartlink, Social Bar) |
| Package manager | npm |
| Hosting target | cPanel (Node.js App hosting / "Setup Node.js App" feature) |

Deployment note: Everything (frontend serving + API + static file serving) runs through `server.js`, matching cPanel's expectation of a single Node.js app entry point with a start script (`npm start` -> `node server.js`).

---

## 4. Folder Structure (high-level, conceptual)

```
/project-root
  server.js                # main entry, starts express app
  config.json               # central app configuration
  /public                  # static frontend (html, css, client-js)
    /css
    /js
    /icons
  /views                   # page templates (home, detail, search, download, admin)
  /routes                  # express route handlers (public + admin + api)
  /storage                 # uploaded software files + software images
    /software
    /images
  /database
    database.sqlite
    schema.sql
  package.json
  PRD.md
```

(Structural guideline, not a strict spec — naming can be adjusted during build.)

---

## 5. Data Model (SQLite)

### Table: `categories`
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | unique |
| slug | TEXT | for URLs |
| created_at | DATETIME | |

### Table: `software`
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | |
| category_id | INTEGER FK | -> categories.id |
| short_description | TEXT | mini description shown on detail page |
| full_description | TEXT | optional longer text |
| version | TEXT | optional |
| size | TEXT | e.g. "45 MB" |
| icon_image | TEXT | path in /storage/images |
| file_path | TEXT | path in /storage/software |
| download_count | INTEGER | default 0 |
| view_count | INTEGER | default 0 |
| is_featured | BOOLEAN | default false |
| is_new | BOOLEAN | default false (or auto by created_at) |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### Table: `download_logs` (for analytics)
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| software_id | INTEGER FK | |
| downloaded_at | DATETIME | |

### Table: `admin_users`
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| username | TEXT | |
| password_hash | TEXT | |

(Admin login exists only for the `/admin` area — the public site itself has no authentication.)

---

## 6. Public Site Pages

### 6.1 Home Page
- Header with logo/site name + search bar (visible at top, always accessible).
- Category quick links/filter chips below search bar.
- New section: grid list, minimum required cards, most recently added software.
- Featured section: curated/highlighted software (flagged by admin), same minimal card style.
- All Software section: full list/grid, paginated or "load more."
- Each card shows: icon/image, name, category tag, short description (truncated), size.
- One Native Banner ad slot placed naturally inside the "All Software" grid (styled like a card, clearly marked "Ad").
- Clicking a card -> navigates to Software Detail Page.

### 6.2 Software Detail Page
- Software icon/image, name, category tag, mini description, file size.
- Download button (primary call-to-action).
- Clicking Download -> redirects to Download Page, and increments `download_count`.
- One Banner ad slot placed below the description/details block (never above or beside the Download button, to avoid accidental clicks and misclick-driven ad fatigue).
- A few related/same-category software suggestions at the bottom (reuses card component).

### 6.3 Search Page
- Search input (carried over from home, or independent entry).
- Category filter (dropdown or checkboxes) to narrow results.
- If no search term entered: shows full explore — all software listed, filterable by category only.
- If a search term is entered: filters by name (and optionally description).
- One Native Banner blended into the results grid (same treatment as Home).
- Empty state message if nothing matches.

### 6.4 Download Page
- Purpose: lightweight intermediary page, not a listing page — and the highest-intent page for monetization.
- On the "Click here to download" click: fires one Popunder (desktop) or Smartlink redirect-on-click (mobile), frequency-capped (see Monetization Strategy below) — never both on the same visit.
- Shows a loading indicator/spinner for a short simulated wait.
- After the loader completes, shows a "Click here to download" button — this is both the real download trigger and the re-download fallback.
- A dismissible Social Bar may appear during the wait (bottom of screen), auto-hides after loader completes or on dismiss.
- Below that: a "You may also like" section suggesting a few more software titles (same card component).
- No login, no forms — purely functional + suggestive.

---

## 7. Monetization Strategy (Adsterra)

Principle: Ads should feel like they belong on a downloading site users already expect this from — not interrupt the task of finding and downloading software. The highest-intent moment (the Download Page) carries the heaviest monetization; browsing pages (Home/Search/Detail) stay light and mostly ad-quiet.

| Ad Format | Where Used | Why |
|---|---|---|
| Popunder | Fires once per session, only from the Download Page, triggered by the "Click here to download" click (desktop only) | Highest-earning format on download sites; opens behind the page so it never blocks the actual download — the pattern used by most established software download sites |
| Smartlink | Used in place of Popunder on mobile devices (Popunders behave poorly on mobile browsers), same trigger point | Better mobile compatibility, still monetizes the intent-to-download moment |
| Native Banner | One slot inside Home page grid, one slot inside Search results grid | Blends with software cards, low visual disruption, good CTR without harming browsing UX |
| Banner | One slot on Software Detail page, below description (never near the Download button) | Standard placement, predictable, keeps the primary action (Download button) unobstructed |
| Social Bar | Only on Download page, only during the loader wait, dismissible | Adds a secondary impression during a moment users are already waiting/idle, without following them across the whole site |

Frequency & UX rules:
- Popunder/Smartlink: max once per session per visitor (tracked client-side), never on repeated downloads within the same session.
- No ad format is ever placed on top of, directly beside, or immediately before the primary Download button/link.
- No autoplay-audio or video ad formats.
- Social Bar is always dismissible and never re-appears once closed in that session.
- All ad slots are optional and toggleable — if a slot is disabled in `config.json` or Admin Settings, that space simply collapses (no empty boxes).
- Ad zone IDs, and which formats are active on which page, are controlled centrally (see `config.json` and Admin -> Settings) so they can be changed without touching code.

---

## 8. Configuration File (config.json)

A single JSON file holds settings that control site behavior and monetization, so changes (ad zone IDs, toggles, limits, branding) don't require touching code. Example structure:

```
{
  "site": {
    "name": "Software Hub",
    "tagline": "Free Windows Software Downloads",
    "itemsPerPage": 20,
    "port": 3000
  },
  "paths": {
    "storage": "./storage",
    "database": "./database/database.sqlite"
  },
  "download": {
    "loaderDurationSeconds": 5,
    "suggestionsCount": 4
  },
  "ads": {
    "provider": "adsterra",
    "enabled": true,
    "popunder": {
      "enabled": true,
      "zoneId": "REPLACE_WITH_ZONE_ID",
      "page": "download",
      "frequencyCapPerSession": 1,
      "devices": ["desktop"]
    },
    "smartlink": {
      "enabled": true,
      "zoneId": "REPLACE_WITH_ZONE_ID",
      "page": "download",
      "frequencyCapPerSession": 1,
      "devices": ["mobile"]
    },
    "nativeBanner": {
      "enabled": true,
      "zoneId": "REPLACE_WITH_ZONE_ID",
      "pages": ["home", "search"]
    },
    "banner": {
      "enabled": true,
      "zoneId": "REPLACE_WITH_ZONE_ID",
      "pages": ["softwareDetail"]
    },
    "socialBar": {
      "enabled": true,
      "zoneId": "REPLACE_WITH_ZONE_ID",
      "page": "download",
      "dismissible": true
    }
  },
  "admin": {
    "sessionSecret": "REPLACE_WITH_RANDOM_SECRET"
  }
}
```

Notes:
- `zoneId` values correspond to Adsterra ad unit codes for each format.
- Any placement can be turned off instantly by setting `"enabled": false` — the corresponding UI slot disappears cleanly.
- `itemsPerPage`, `loaderDurationSeconds`, and `suggestionsCount` let the owner tune UX without code changes.
- In addition to editing this file directly, the same values are exposed through Admin -> Settings (see 9.5) for convenience.

---

## 9. Admin Panel

(This is the only part of the site with authentication — simple username/password login.)

### 9.1 Admin Login
- Basic login form (username + password) guarding `/admin` routes.

### 9.2 Dashboard (Analytics)
- Total views (site-wide or per software).
- Total downloads (site-wide, and top-downloaded list).
- Total software count.
- Total categories count.
- Simple charts/counters — kept minimal (numbers + basic bar/line chart), no complex BI dashboard.

### 9.3 Software Management
- List all software (table view: name, category, downloads, views, actions).
- Add software: form with name, category, short description, full description, version, size, icon/image upload, file upload (saved to `/storage`).
- Edit software: same form, pre-filled.
- Delete software: confirmation before delete; also removes associated files from `/storage`.

### 9.4 Category Management
- List all categories.
- Add new category (name).
- Edit category name.
- Delete category (with a safeguard/warning if software is still assigned to it).

### 9.5 Settings (Ads & Site Config)
- Simple form view mirroring `config.json`: toggle each ad format on/off, edit zone IDs, edit site name/tagline, items per page, loader duration.
- Saves back to `config.json` so changes take effect without redeploying code.

---

## 10. UI / UX Requirements

- Design style: Super clean, minimal. No gradients. Flat colors, generous whitespace, clear typography hierarchy.
- Icons: Minimal icon set (line-style) for search, download, category, filters, admin nav, etc. Never use emoji anywhere in UI text or icons.
- Ad labeling: Every ad slot is clearly marked ("Advertisement") and visually separated from real content, so trust in the software listings stays intact.
- Responsiveness: Must work cleanly on mobile and desktop — cards reflow into a single column on small screens, nav collapses appropriately, buttons remain thumb-friendly.
- Component reuse: Software card component reused across Home, Search, Detail (suggestions), and Download page (suggestions).
- Consistency: Same header/search bar pattern across public pages (simplified on Download page).

---

## 11. Non-Functional Requirements

- No authentication on public-facing pages (home, detail, search, download).
- Authentication required only for `/admin`.
- File storage handled locally via `/storage` folder.
- Database: SQLite file, no external DB server dependency.
- Must run as a single Node.js process via `server.js`, compatible with cPanel's Node.js App setup.
- All configurable values (ads, site settings, limits) centralized in `config.json`.
- Basic input validation on admin forms (required fields, file type checks for uploads).
- Download and view counters update reliably without requiring page refresh tricks.
- Ad scripts load asynchronously and never block page render or the Download button's availability.

---

## 12. Out of Scope (for this version)

- User accounts/registration on the public side.
- Comments, ratings, or reviews.
- Payment/premium software handling.
- Multi-admin roles/permissions (single admin login is sufficient).
- Non-Windows software categories.
- Video/audio ad formats.

---

## 13. Success Criteria

- A visitor can land on Home, browse New/Featured/All, search with category filters, view a software's detail page, and complete a download — all without creating an account, and without feeling bombarded by ads.
- Ads (Popunder/Smartlink, Native Banner, Banner, Social Bar) generate revenue primarily at the highest-intent moment (Download Page) while browsing pages stay light.
- Admin can log in separately, fully manage software/categories, adjust ad settings, and see basic view/download analytics — without editing code.
- Site loads clean and minimal on both mobile and desktop with no gradients or emoji in the UI.
- Entire app runs via `node server.js`, reads settings from `config.json`, and deploys on a standard cPanel Node.js hosting environment.
