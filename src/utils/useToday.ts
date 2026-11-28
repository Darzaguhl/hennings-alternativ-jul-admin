import { useEffect, useState } from 'react'
import { todayInOslo } from './dates'

// Today's date, kept current: a screen left open past midnight (or woken from
// sleep) moves on to the new day by itself.
export function useToday() {
  const [today, setToday] = useState(() => todayInOslo())
  useEffect(() => {
    const check = () => setToday(todayInOslo())
    const timer = setInterval(check, 30_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return today
}
