# Sundew Logo Assets

Developer-ready exports traced directly from the user-supplied final Sundew Visual Identity System V1.0 board. Element geometry, placement, proportions, and color relationships follow that board without redesign.

## Colors

- French Blue: `#1F4ED8`
- Sundew Red: `#E63946`
- Cream: `#FAF8F4`
- Navy: `#0F2747`

## Usage

- `sundew-symbol-3d-512.png`: soft-3D symbol, trimmed for the web (`SundewLogo`: login, sidebar, demo header)
- `sundew-app-icon-bold-512.png`: favicon and Apple touch icon (`src/app/layout.tsx`)

The wordmark is live text set in Nunito 800 (`src/components/sundew-logo.tsx`), not an asset: the traced wordmark had rough edges.

Only the files the app references are kept. The other exports (horizontal and stacked lockups, flat symbol, monochrome, reversed, light app icon, other PNG sizes) and the source identity board were removed in 2026-10 and remain in git history.

Preserve proportions, do not recolor individual elements, and keep clear space around the mark of at least the organic star's width.
