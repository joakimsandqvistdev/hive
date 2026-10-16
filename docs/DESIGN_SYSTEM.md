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

## Feedback and notifications

- Use the shared Hive flash notification system for transient outcomes such as successful validation, completed actions, and non-blocking operation failures. Do not use a Mantine `Alert` with a title for a success notification or other brief status message.
- Keep Mantine `Alert` components for persistent, actionable context that should remain visible until the user addresses it, such as missing server configuration, a workflow needing repair, or a form error that must be corrected before continuing.
- Use the flash tone that matches the outcome (`success`, `warning`, `error`, or `neutral`) and keep its title and message concise. Avoid showing the same outcome both as a flash and as an alert.

## Confirmation dialogs

- Use Hive's shared `ConfirmActionModal` for confirmations, including destructive actions and actions with external side effects. Do not use native browser dialogs such as `window.confirm`, `window.alert`, or `window.prompt`; they interrupt the application flow and do not match Hive's design system.
- State the action and its consequences clearly in the modal, use a specific confirm button label, and provide a cancel action. For destructive actions, use the destructive styling and explain what will be removed or affected.
