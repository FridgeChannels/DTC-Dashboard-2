# Admin mobile navigation — dropdown (A)

## Decision
On viewports `≤900px`, replace the horizontal chip strip with a collapsed top bar:

- Left: FridgeChannel brand
- Right cluster: `Menu` toggle, then `Accounts` at the far right
- Tap `Menu` to open a dropdown panel under the bar (option A)
- Desktop (`>900px`) keeps the vertical sidebar; Accounts stays at the sidebar foot

## Behavior
- Selecting a nav item closes the menu
- Backdrop click, outside pointerdown, and `Escape` close the menu
- Accounts is not duplicated inside the dropdown on mobile

## Files
- `src/dashboard/components/admin.jsx`
- `src/dashboard/components/shared.jsx` (menu icons)
- `src/dashboard/styles/styles.css`
- `src/dashboard/admin.html` (asset cache bust)
