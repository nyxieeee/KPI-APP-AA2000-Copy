/** ID on the main white workspace card in employee department dashboards. */
export const EMPLOYEE_WORKSPACE_ID = 'employee-workspace';

/**
 * Scrolls the main scrollable container back to the top when switching sidebar tabs,
 * so the new content is immediately visible without the user needing to scroll up.
 */
export function scrollEmployeeWorkspaceIntoView(): void {
  requestAnimationFrame(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    if (main) { main.scrollTop = 0; return; }
    document.getElementById(EMPLOYEE_WORKSPACE_ID)?.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
}
