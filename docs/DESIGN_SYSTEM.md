## Design Principles

- Maintain a consistent visual identity across the application.
- Prefer existing design tokens and reusable components.
- Support responsive layouts and accessible contrast.
- Avoid one-off styling when an existing pattern is available.
- Use Mantine components when possible

## Soft workspace appearance

- The default appearance is light, based on the accepted Soft workspace preview (2026-10-13). This replaces the earlier Slate Sky dark appearance.
- Use the centralized gray palette for a pale workspace/sidebar, white content surfaces, dark text, and quiet borders. Use `hiveSky` blue for primary actions, focus, and pale selected-navigation backgrounds.
- Use medium-radius content panels, small-radius form controls, and subtle theme shadows. Keep tables readable with generous cell spacing and muted headings.
- Keep the workflow canvas pale, nodes and configuration panels white, and selected nodes clearly outlined. Use darker semantic color shades for text on light surfaces.
- Preserve existing navigation, responsive behavior, and product functionality when adjusting presentation.

## Implementation Rules

- Use the project's existing theme and styling system.
- Prefer centralized tokens over hardcoded color values.
- Preserve accessible text and interactive-state contrast.
- Update the design tokens rather than creating conflicting alternatives.
