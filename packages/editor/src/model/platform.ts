/** The primary shortcut modifier as users expect to see it on their OS. */
export function primaryModifierLabel(platform = navigator.platform): '⌘' | 'Ctrl' {
  return /^(Mac|iPhone|iPad|iPod)/.test(platform) ? '⌘' : 'Ctrl';
}
