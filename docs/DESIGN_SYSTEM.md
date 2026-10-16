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

## Workspace inventory tables

- Use the shared `inventory-table` typography and table surfaces for Models, Media Library, Workflows, Custom Nodes, Jobs, Runs, and Webhook Manager. Primary names use consistent medium emphasis (`600`) at the small body size; secondary metadata stays smaller and dimmed.
- For paged lists, place the displayed item range and total (for example, `11-20 of 42 workflows`) at the bottom left of the table card and the pagination controls at the bottom right. Use `PaginatedTableFooter` rather than custom pagination markup.
- Detail or activity tables should reuse the same compact headers, row separators, and text hierarchy as their parent inventory table.
## Selection details drawers

- Keep inventory lists full width when a selected item needs a detail view. Open its details in a right-side Mantine Drawer so list rows retain useful column width.
- Use the same right-side drawer pattern for selected-node configuration in both Workflow and Custom Node editors. Keep the canvas full width beneath the drawer and retain the selected-node highlight.
- Use one consistent drawer transition everywhere: `transitionProps={{ transition: "slide-left", duration: 180 }}` for right-side drawers. Keep drawers mounted while closed when needed so their exit transition can complete.
- Keep configuration drawers compact like the webhook setup modal: use small body spacing, compact input heights and labels, and restrained vertical gaps while preserving enough room for readable helper text and complex controls.
- On narrow screens, let drawers use the available viewport width. Keep close and Escape behavior available and do not alter the workflow canvas theme or node styling as part of drawer work.
