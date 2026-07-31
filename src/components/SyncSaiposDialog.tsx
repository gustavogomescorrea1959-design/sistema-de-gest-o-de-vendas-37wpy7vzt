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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Loader2,
  RefreshCw,
  CalendarIcon,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react'
import { ClientResponseError } from 'pocketbase'
import { syncSaipos, testSaiposToken, type SaiposTokenTest } from '@/services/saipos-sync'
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
  const [testResult, setTestResult] = useState<SaiposTokenTest | null>(null)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const handleTestToken = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testSaiposToken()
      setTestResult(result)
      setTokenValid(result.valid)
      if (!result.valid) {
        toast({
          title: 'Token Saipos Inválido',
          description: result.message || 'Token Saipos Inválido',
          variant: 'destructive',
        })
      }
    } catch {
      setTokenValid(false)
      setTestResult(null)
    } finally {
      setTesting(false)
    }
  }

  const handleCopyDetails = () => {
    if (!testResult) return
    const details = [
      `Status: ${testResult.statusCode ?? 'N/A'}`,
      `Message: ${testResult.message}`,
      `URL: ${testResult.requestUrl ?? 'N/A'}`,
      `Response Body:`,
      testResult.responseBody || '(empty)',
    ].join('\n')
    navigator.clipboard.writeText(details)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
      const e = err as ClientResponseError
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
              <span className="text-red-600">Token Saipos Inválido</span>
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

        {testResult && !testResult.valid && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="error-details" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-medium py-3">
                Detalhes do erro
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-1">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Código HTTP</span>
                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                      {testResult.statusCode ?? 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      URL da requisição
                    </span>
                    <pre className="mt-1 text-xs font-mono bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                      {testResult.requestUrl || 'N/A'}
                    </pre>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Corpo da resposta
                    </span>
                    <pre className="mt-1 text-xs font-mono bg-muted p-2 rounded overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                      {testResult.responseBody || '(vazio)'}
                    </pre>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleCopyDetails} className="w-full">
                  {copied ? (
                    <>
                      <Check className="mr-2 h-3 w-3" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-3 w-3" />
                      Copiar detalhes
                    </>
                  )}
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

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
