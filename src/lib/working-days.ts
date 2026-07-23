import { getDaysInMonth, getDay, getDate, format } from 'date-fns'

const HOLIDAYS = ['12-24', '01-01']

export function isWorkingDay(date: Date): boolean {
  if (getDay(date) === 0) return false
  const monthDay = format(date, 'MM-dd')
  if (HOLIDAYS.includes(monthDay)) return false
  return true
}

export function getWorkingDaysInMonth(year: number, monthIndex: number): number {
  const days = getDaysInMonth(new Date(year, monthIndex, 1))
  let count = 0
  for (let i = 1; i <= days; i++) {
    if (isWorkingDay(new Date(year, monthIndex, i))) count++
  }
  return count
}

export function getWorkingDaysPassed(year: number, monthIndex: number): number {
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIndex
  if (!isCurrentMonth) {
    return getWorkingDaysInMonth(year, monthIndex)
  }
  const dayOfMonth = getDate(today)
  let count = 0
  for (let i = 1; i <= dayOfMonth; i++) {
    if (isWorkingDay(new Date(year, monthIndex, i))) count++
  }
  return count
}
