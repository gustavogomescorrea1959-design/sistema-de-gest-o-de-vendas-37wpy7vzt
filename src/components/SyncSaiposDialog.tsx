import { useState, useEffect } from 'react'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Loader2, RefreshCw, CalendarIcon, CheckCircle2, AlertCircle } from 'lucide-react'
import { syncSaipos, testSaiposToken } from '@/services/saipos-sync'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface SyncSaiposDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function SyncSaiposDialog({ open, onOpenChange, onSuccess }: SyncSaiposDialogProps) {
  const [date, setDate] = useState<{ from?: Date; to?: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })
  const [syncing, setSyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)
  const { toast } = useToast()

  const handleTestToken = async () => {
    setTesting(true)
    try {
      const result = await testSaiposToken()
      setTokenValid(result.valid)
      if (!result.valid) {
        toast({
          title: 'Token Saipos inválido',
          description: result.message,
          variant: 'destructive',
        })
      }
    } catch {
      setTokenValid(false)
    } finally {
      setTesting(false)
    }
  }

  useEffect(() => {
    if (open && tokenValid === null) handleTestToken()
  }, [open, tokenValid])

  const handleSync = async () => {
    if (!date?.from || !date?.to) {
      toast({
        title: 'Selecione um período',
        description: 'Escolha as datas de início e fim.',
        variant: 'destructive',
      })
      return
    }
    setSyncing(true)
    try {
      const result = await syncSaipos(
        format(date.from, 'yyyy-MM-dd'),
        format(date.to, 'yyyy-MM-dd'),
      )
      toast({
        title: 'Sincronização concluída!',
        description: `${result.insertedCount} novo(s), ${result.updatedCount} atualizado(s), ${result.skippedCount} pulado(s).`,
      })
      onSuccess?.()
      onOpenChange(false)
    } catch (err: unknown) {
      const e = err as { response?: { error?: string }; message?: string }
      const message = e?.response?.error || e?.message || 'Erro ao sincronizar com Saipos'
      toast({ title: 'Erro na sincronização', description: message, variant: 'destructive' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sincronizar com Saipos
          </DialogTitle>
          <DialogDescription>Importe vendas do ERP Saipos automaticamente.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          {testing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Validando token...</span>
            </>
          ) : tokenValid ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-green-600">Token válido</span>
            </>
          ) : tokenValid === false ? (
            <>
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-red-600">Token inválido</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTestToken}
                className="h-6 text-xs"
                disabled={testing}
              >
                Tentar novamente
              </Button>
            </>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>Período</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'flex-1 justify-start font-normal',
                    !date?.from && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date?.from ? format(date.from, 'dd/MM/yyyy') : 'Data inicial'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date?.from}
                  onSelect={(d) => setDate((p) => ({ ...p, from: d }))}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'flex-1 justify-start font-normal',
                    !date?.to && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date?.to ? format(date.to, 'dd/MM/yyyy') : 'Data final'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={date?.to}
                  onSelect={(d) => setDate((p) => ({ ...p, to: d }))}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={syncing}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSync}
            disabled={syncing || testing || !tokenValid}
            className="w-full sm:w-auto"
          >
            {syncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sincronizar Agora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
