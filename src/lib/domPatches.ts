/**
 * DOM safety patches
 *
 * Some browser translators/extensions mutate the DOM inside the React root.
 * This can break React's assumptions and lead to errors like:
 *   NotFoundError: Failed to execute 'removeChild' on 'Node'
 *
 * These patches make DOM operations more defensive to avoid hard crashes.
 */

declare global {
  interface Window {
    __DRAMAAI_DOM_SAFETY_PATCHES__?: boolean
  }
}

export function applyDomSafetyPatches() {
  if (typeof window === 'undefined') return
  if (window.__DRAMAAI_DOM_SAFETY_PATCHES__) return

  window.__DRAMAAI_DOM_SAFETY_PATCHES__ = true

  const originalRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    // If the DOM was mutated externally, React may try to remove a node
    // that is no longer a direct child.
    if (child && child.parentNode !== this) {
      return child
    }
    return originalRemoveChild.call(this, child) as T
  }

  const originalInsertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    // If referenceNode was moved elsewhere, fall back to append.
    if (referenceNode && referenceNode.parentNode !== this) {
      return originalInsertBefore.call(this, newNode, null) as T
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T
  }
}
