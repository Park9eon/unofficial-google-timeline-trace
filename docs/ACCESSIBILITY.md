# Accessibility

## Form controls

The editor uses shared `Field`, `ControlRow`, `Toggle`, `Range`, and `Segmented` components. A field keeps its label, optional help button, value, and input in a stable grid rather than spacing unrelated children with `justify-content: space-between`.

Help icons are included only when the setting has a non-obvious effect. Their buttons have accessible names and Radix supplies keyboard- and pointer-accessible tooltip behavior. Obvious labels such as dates and colors do not repeat their names in tooltips.

## Keyboard scope

Player shortcuts run only while the player workspace has focus. Typing or pressing Space in inputs, selects, buttons, dialogs, or elsewhere on the page does not control playback. The workspace exposes its shortcut list through `aria-keyshortcuts`, and focus is visible.

The progress bar supports pointer scrubbing and click-to-jump. Buttons, tabs, dialogs, and the Timeline source selector have explicit accessible names.

At tablet and DevTools-docked widths, header actions collapse to icons while retaining their accessible names. The Timeline selector and operation/error status move to a dedicated visible row instead of disappearing. The playback-rate selector keeps an explicit accessible name even when its visual label is hidden for space.

## Visual readability

- Emoji markers sit on a high-contrast circular badge with a white edge, accent inset, and shadow.
- Direction is not conveyed only by emoji orientation: a separate needle shows the full heading.
- Text labels use an opaque or translucent contrast surface, shadow, and three selectable treatments.
- Focus indicators use a visible outline independent of hover color.
- Status and selection colors are checked against both light and dark surfaces.

## Verification

The browser UI check runs axe against the rendered Studio and fails on serious or critical violations. It also verifies field/help adjacency, dialog names, player-only shortcut handling, progress seeking, marker choices, and label variants. Automated results supplement rather than replace keyboard, zoom, reduced-motion, and screen-reader review before a public release.
