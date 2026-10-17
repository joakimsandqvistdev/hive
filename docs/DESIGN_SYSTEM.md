## Design Principles

- Maintain a consistent visual identity across the application.
- Prefer existing design tokens and reusable components.
- Support responsive layouts and accessible contrast.
- Avoid one-off styling when an existing pattern is available.
- Use Mantine components when possible

## Page content width

- Use the shared `home-page` / `workspace-page` root width for top-level page stacks: `width: min(100%, 1400px)` with centered margins. New pages should use `workspace-page` so their content aligns with Media Library and other workspace pages.
- Keep internal cards, tables, and detail panels responsive within that shared page width. Full-canvas editors have their own full-viewport layout and do not use this page container.

## Soft workspace appearance

- The default appearance is light, based on the accepted Soft workspace preview (2026-10-13). This replaces the earlier Slate Sky dark appearance.
- Hive UI previews, mockups, and visualizations use this light Mantine theme regardless of the host appearance setting, unless a dark variant is explicitly requested. Use a pale gray (`gray.0`) workspace, white surfaces, Inter typography, Hive blue (`hiveSky`) primary actions, and the established semantic success/warning/error colors.
- Use the centralized gray palette for a pale workspace/sidebar, white content surfaces, dark text, and quiet borders. Use `hiveSky` blue for primary actions, focus, and pale selected-navigation backgrounds.
- Use medium-radius content panels, small-radius form controls, and subtle theme shadows. Keep tables readable with generous cell spacing and muted headings.
- Keep the workflow canvas pale, nodes and configuration panels white, and selected nodes clearly outlined. Use darker semantic color shades for text on light surfaces.
- Preserve existing navigation, responsive behavior, and product functionality when adjusting presentation.
- When visualizing a change to an existing Hive page, use the current page layout and styles as the fixed baseline. Do not create detached or approximate mockups; vary only the requested component or detail within the real page context.

## Workflow editor appearance

- Do not change the editor's visual styling—including canvas colors, node surfaces, controls, minimap, typography, spacing, or interaction states—unless the user explicitly requests an editor styling change.
- For non-visual feature work, preserve the existing editor appearance. When changing editor UI, inspect the current patterns and limit visual changes to the requested scope.

## Implementation Rules

- Use the project's existing theme and styling system.
- Prefer centralized tokens over hardcoded color values.
- Preserve accessible text and interactive-state contrast.
- Update the design tokens rather than creating conflicting alternatives.

## Feedback and notifications

- Use the shared Hive flash notification system for transient outcomes, including page/list request failures, preview or refresh failures, completed actions, and other non-blocking operation failures. Do not render these transient errors in a page-level Mantine `Alert`; use a concise error flash instead. Deduplicate errors from background polling so a continuing outage does not produce repeated notifications, and clear the deduplication state after a successful request.
- Keep Mantine `Alert` components for persistent, actionable context that should remain visible until the user addresses it, such as missing server configuration, a workflow needing repair, or a form error that must be corrected before continuing. Inline field validation may remain attached to the affected field.
- Use the flash tone that matches the outcome (`success`, `warning`, `error`, or `neutral`) and keep its title and message concise. Avoid showing the same outcome both as a flash and as an alert.

## Confirmation dialogs

- Use Hive's shared `ConfirmActionModal` for confirmations, including destructive actions and actions with external side effects. Do not use native browser dialogs such as `window.confirm`, `window.alert`, or `window.prompt`; they interrupt the application flow and do not match Hive's design system.
- State the action and its consequences clearly in the modal, use a specific confirm button label, and provide a cancel action. For destructive actions, use the destructive styling and explain what will be removed or affected.

## Workspace inventory tables

- Use the shared `inventory-table` typography and table surfaces for Models, Media Library, Workflows, Custom Nodes, Jobs, Runs, and Webhook Manager. Primary names use consistent medium emphasis (`600`) at the small body size; secondary metadata stays smaller and dimmed.
- For paged lists, place the displayed item range and total (for example, `11-20 of 42 workflows`) at the bottom left of the table card and the pagination controls at the bottom right. Use `PaginatedTableFooter` rather than custom pagination markup.
- Detail or activity tables should reuse the same compact headers, row separators, and text hierarchy as their parent inventory table.
- Use icon-only buttons by default for actions in list rows to keep columns compact. Use visible text or an icon-plus-text combination only when the user specifically requests it. Reuse `WorkspaceTableActions` and `WorkspaceTableAction` with the shared action icons; each icon-only action must have a concise tooltip and an accessible `aria-label`, and destructive actions must retain the semantic error color. Keep text buttons for primary page-level actions, not repeated row actions.
## Selection details drawers

- Keep inventory lists full width when a selected item needs a detail view. Open its details in a right-side Mantine Drawer so list rows retain useful column width.
- Use the same right-side drawer pattern for selected-node configuration in both Workflow and Custom Node editors. Keep the canvas full width beneath the drawer and retain the selected-node highlight.
- Use one consistent drawer transition everywhere: `transitionProps={{ transition: "slide-left", duration: 180 }}` for right-side drawers. Keep drawers mounted while closed when needed so their exit transition can complete.
- Keep configuration drawers compact like the webhook setup modal: use small body spacing, compact input heights and labels, and restrained vertical gaps while preserving enough room for readable helper text and complex controls.
- On narrow screens, let drawers use the available viewport width. Keep close and Escape behavior available and do not alter the workflow canvas theme or node styling as part of drawer work.
