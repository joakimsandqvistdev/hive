export function notifyNavigationSummaryChanged() {
  window.dispatchEvent(new Event("hive:navigation-summary-refresh"));
}
