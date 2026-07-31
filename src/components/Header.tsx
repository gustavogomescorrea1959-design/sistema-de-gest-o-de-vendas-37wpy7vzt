import { useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { format, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Settings } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import logoAlecrim from '@/assets/icone-alecrim-c1c5d.png'
import { SettingsDialog } from '@/components/SettingsDialog'

export function Header() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard':
        return 'Dashboard'
      case '/vendas-diarias':
        return 'Vendas Diárias'
      case '/metas':
        return 'Gestão de Metas'
      default:
        return ''
    }
  }

  const monthParam = searchParams.get('month')
  const currentDate = monthParam ? new Date(`${monthParam}-02T00:00:00`) : new Date()

  const handleMonthChange = (date: Date) => {
    setSearchParams({ month: format(date, 'yyyy-MM') })
  }

  const prevMonth = () => handleMonthChange(subMonths(currentDate, 1))
  const nextMonth = () => handleMonthChange(addMonths(currentDate, 1))

  return (
    <>
      <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-card border-b border-border/50 shadow-sm z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="-ml-2 sm:hidden" />
          <img src={logoAlecrim} alt="Logo Alecrim" className="h-8 w-8 object-contain" />
          <h1 className="text-lg font-semibold text-foreground hidden sm:block">
            {getPageTitle()}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn('h-8 min-w-[140px] justify-center capitalize font-medium')}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-4 text-center text-sm text-muted-foreground">
                Use as setas para navegar entre os meses.
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="icon" onClick={nextMonth} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            className="h-8 w-8"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
