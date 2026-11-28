import { createContext, useContext, useEffect, useId } from 'react'

// Lets a form inside a Drawer say "something here isn't saved yet", so that
// closing the panel (✕, Escape, clicking outside) asks first. Only needed for
// forms with their own save button; fields that save on blur don't use it.
export const UnsavedContext = createContext<((id: string, unsaved: boolean) => void) | null>(null)

export function useUnsavedChanges(unsaved: boolean) {
  const report = useContext(UnsavedContext)
  const id = useId()
  useEffect(() => {
    report?.(id, unsaved)
    return () => report?.(id, false)
  }, [report, id, unsaved])
}
