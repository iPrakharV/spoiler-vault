const paths = {
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  seal: '<path d="m12 2 2.6 1.7 3.1.2 1.1 2.9 2.2 2.2-.7 3 .7 3-2.2 2.2-1.1 2.9-3.1.2L12 22l-2.6-1.7-3.1-.2-1.1-2.9L3 15l.7-3L3 9l2.2-2.2 1.1-2.9 3.1-.2Z"/><path d="M9 9.5a3 3 0 0 1 6 0v1H9Zm-.5 1h7v5h-7Z"/>',
  jar: '<path d="M8 3h8v3H8zM8 6v2l-3 4v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7l-3-4V6M5 14h14"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.lock}</svg>`;
}
export function mountIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
}
