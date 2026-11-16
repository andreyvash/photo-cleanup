# Noridoc: components

Path: @/src/components

### Overview
- Shared presentational pieces for the screens in `@/src/app`: the grid tile, the Library list header, the floating selection bar, pill buttons, iOS-style grouped lists, and a centered message view for empty, permission and error states.
- Components get their data and callbacks through props and never read stores or services. The routes do all of the state wiring.

### How it fits into the larger codebase
- All styling comes from `@/src/theme.ts`:
  - one accent (system blue) and iOS semantic colors through expo-router's `Color`. `surface` is for cards and banners on the plain `background` (such as the Library header banners), and `card` is for rows on `groupedBackground`;
  - the shape rule: actions are pills, floating bars are capsules, cards use radius 16, list thumbnails use 8, grid tiles are square;
  - `tabularNumbers` for any text showing sizes or counts.
- Size and duration text comes from `@/src/lib/format.ts`. A tile's `size` prop follows the library's three-state size convention from `@/src/library/types.ts`.
- Images load through expo-image's photo-library loader with `ph://<localIdentifier>` URIs.
- Native pieces:
  - The segmented filter `Picker` and the `ProgressView` in the Library header are SwiftUI views from `@expo/ui`, placed inside a `Host`.
  - SF Symbols come from `expo-symbols`.
  - The selection bar uses Liquid Glass from `expo-glass-effect` when it's available.
- Jest tests and Maestro flows find elements by these components' `testID`s and accessibility roles and labels, for example `library-tile`, the tile's select checkbox, `selection-bar` and `library-filter`. Changing them breaks tests in `@/test` and `e2e/`.

### Core Implementation
- `LibraryTile` is wrapped in `memo` for FlashList and sets `recyclingKey` to the item ID. It shows:
  - the thumbnail;
  - a size pill at the bottom left;
  - a duration badge at the top left for videos;
  - a separate 44pt select target at the bottom right.

  Tapping the tile opens the preview, and tapping the circle toggles selection. For VoiceOver, its label reads like "Video, 25.8 MB, 0:10", and custom `activate` and `select` actions provide both behaviors.
- `LibraryHeader` stacks, from top to bottom:
  - the summary of the visible items;
  - a progress row while sizes are being measured;
  - the notice banner after a delete;
  - the limited-access banner with a Manage button;
  - the SwiftUI segmented filter (All, Photos, Videos).
- `SelectionBar` floats above the bottom safe area. It shows the selection summary, a Clear button, Delete (destructive tinted) and Send to Drive. It exports `SELECTION_BAR_HEIGHT` so the list can add matching bottom padding.
- `Button` is a pill with variants (such as `primary`, `destructive`, `tinted` and `plain`) and an optional SF Symbol. When disabled it's drawn at reduced opacity.
- `GroupedSection` and `GroupedRow` draw inset grouped sections like iOS Settings. The section puts separators between rows, and a row shows a checkmark when `selected`.
- `MessageView` is a centered icon, title and body, with an optional action.

### Things to Know
- A tile's `size` prop distinguishes `undefined` from `null`. `undefined` means not measured yet: no pill, and no size in the accessibility label. `null` means the size couldn't be read, and the pill says "Size unavailable".
- The segmented filter is a native SwiftUI Picker. Tests drive it with `fireEvent(el, 'selectionChange', { nativeEvent: { selection } })`, not with presses.
- The select circle is a `Pressable` nested inside the tile's `Pressable`, so tapping it toggles selection without opening the preview.
- Text and badges drawn over photos use `colors.onMedia` and `colors.mediaScrim`, so they look the same in light and dark mode.
- `GroupedSection` drops falsy children, so screens can render rows conditionally inline.

Created and maintained by Nori.
