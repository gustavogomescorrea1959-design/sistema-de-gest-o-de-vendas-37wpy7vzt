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
import {
  syncSaipos,
  testSaiposToken,
  type SaiposTokenTest,
  type SaiposDiagnostic,
} from '@/services/saipos-sync'
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
  const [syncDiagnostic, setSyncDiagnostic] = useState<SaiposDiagnostic | null>(null)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  // Classifica um resultado de teste de token para exibir a mensagem correta.
  // Retorna { title, isAuth } — isAuth=true significa que o erro é de token inválido.
  function describeTestError(result: SaiposTokenTest): { title: string; isAuth: boolean } {
    const errorType = result.errorType
    const status = result.statusCode ?? 0
    if (errorType === 'timeout' || status === 0) {
      return {
        title: 'Timeout / API demorou para responder',
        isAuth: false,
      }
    }
    if (errorType === 'connection') {
      return { title: 'Erro de conexão com a Saipos', isAuth: false }
    }
    if (errorType === 'auth' || status === 401 || status === 403) {
      return { title: 'Token Saipos Inválido', isAuth: true }
    }
    return { title: 'Falha ao validar token', isAuth: false }
  }

  const handleTestToken = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testSaiposToken()
      setTestResult(result)
      setTokenValid(result.valid)
      if (!result.valid) {
        const { title } = describeTestError(result)
        toast({
          title,
          description: result.message || title,
          variant: 'destructive',
        })
      }
    } catch {
      setTokenValid(false)
      setTestResult(null)
      toast({
        title: 'Erro de conexão com a Saipos',
        description: 'Não foi possível validar o token. Verifique sua conexão.',
        variant: 'destructive',
      })
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
    setSyncDiagnostic(null)
    try {
      const result = await syncSaipos(
        format(date.from, 'yyyy-MM-dd'),
        format(date.to, 'yyyy-MM-dd'),
      )

      const totalSynced =
        (result.insertedCount || 0) + (result.updatedCount || 0) + (result.skippedCount || 0)
      const diag = result.diagnostic
      const segments = result.segments || 1
      const totalSales = result.totalSales ?? 0
      const skippedOtherStore = result.skippedOtherStoreCount ?? 0

      // Quando a sincronização retorna 0 registros, exibe o diagnóstico da
      // resposta da Saipos na mensagem para o usuário poder nos reportar a
      // estrutura real recebida da API.
      if (totalSynced === 0 && diag) {
        const keys = (diag.topLevelKeys || []).join(', ') || '(nenhuma)'
        const itemKeys = (diag.firstItemKeys || []).join(', ') || '(nenhuma)'
        const snippet = diag.rawBodySnippet
          ? `\nCorpo bruto (até 500 chars):\n${diag.rawBodySnippet}`
          : ''
        toast({
          title: 'Sincronização retornou 0 registros',
          description: `${segments} segmento(s) | ${totalSales} venda(s) bruta(s). Status ${diag.statusCode ?? 'N/A'} | tipo: ${diag.responseType ?? 'N/A'} | chaves: [${keys}] | items: ${diag.itemsLength ?? 0} | chaves do 1º item: [${itemKeys}].${snippet}`,
          variant: 'destructive',
        })
        setSyncDiagnostic(diag)
      } else {
        toast({
          title: 'Sincronização concluída!',
          description: `${result.insertedCount} novo(s), ${result.updatedCount} atualizado(s), ${result.skippedCount} pulado(s)${
            skippedOtherStore > 0 ? `, ${skippedOtherStore} de outra(s) loja(s) ignorada(s)` : ''
          } — ${segments} segmento(s) de até 15 dias, ${totalSales} venda(s) bruta(s).`,
        })
      }
      onSuccess?.()
      onOpenChange(false)
    } catch (err: unknown) {
      const e = err as ClientResponseError
      const status = e?.status ?? 0
      let title = 'Erro na sincronização'
      let message = e?.response?.error || e?.message || 'Erro ao sincronizar com Saipos'
      if (status === 504) {
        title = 'Timeout / API demorou para responder'
        message =
          'A API do Saipos demorou demais para responder. Tente um período menor ou tente novamente.'
      } else if (status === 0 || status === 503) {
        title = 'Erro de conexão com a Saipos'
      }

      // Erro de validação ao salvar (ex.: revenue/average_ticket em branco):
      // exibe as chaves do 1º item extraído no toast e no accordion de
      // diagnóstico para o time poder ajustar o mapeamento de campos.
      const resp = (e?.response || {}) as {
        diagnostic?: SaiposDiagnostic | null
        validationError?: boolean
      }
      const diag = resp.diagnostic
      const itemKeys = (diag?.firstItemKeys || []).join(', ')
      if (resp.validationError && diag && itemKeys) {
        title = 'Falha ao salvar vendas (validação)'
        message = `${message}\nChaves do 1º item extraído: ${itemKeys}`
        setSyncDiagnostic(diag)
      } else if (diag && itemKeys) {
        // Outros erros, mas com diagnóstico disponível — também ajuda mostrar.
        message = `${message}\nChaves do 1º item extraído: ${itemKeys}`
        setSyncDiagnostic(diag)
      }

      toast({ title, description: message, variant: 'destructive' })
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
              <span className="text-red-600">
                {testResult ? describeTestError(testResult).title : 'Falha ao validar token'}
              </span>
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

        {/* Diagnóstico da resposta da Saipos quando o token é válido mas a
            extração de items retornou 0 — ajuda a entender o formato real. */}
        {testResult && testResult.valid && testResult.diagnostic && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="saipos-diag" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-medium py-3">
                Diagnóstico da resposta Saipos
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Código HTTP</span>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                    {testResult.diagnostic.statusCode ?? 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Tipo da resposta
                  </span>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                    {testResult.diagnostic.responseType ?? 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Items extraídos</span>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                    {testResult.diagnostic.itemsLength ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    Chaves do objeto (top level)
                  </span>
                  <pre className="mt-1 text-xs font-mono bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                    {(testResult.diagnostic.topLevelKeys || []).join(', ') || '(nenhuma)'}
                  </pre>
                </div>
                {(testResult.diagnostic.firstItemKeys || []).length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Chaves do 1º item extraído
                    </span>
                    <pre className="mt-1 text-xs font-mono bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                      {(testResult.diagnostic.firstItemKeys || []).join(', ')}
                    </pre>
                  </div>
                )}
                {(testResult.diagnostic.historyKeys || []).length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Chaves do 1º history (vendas)
                    </span>
                    <pre className="mt-1 text-xs font-mono bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                      {(testResult.diagnostic.historyKeys || []).join(', ')}
                    </pre>
                  </div>
                )}
                {testResult.diagnostic.rawBodySnippet && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Corpo bruto (até 500 chars)
                    </span>
                    <pre className="mt-1 text-xs font-mono bg-muted p-2 rounded overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                      {testResult.diagnostic.rawBodySnippet}
                    </pre>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Diagnóstico da sincronização exibido quando ela retorna 0 registros
            (HTTP 200, items extraídos, mas nenhum mapeado para daily_sales) ou
            quando a sincronização extrai itens mas falha ao salvar por erro de
            validação (ex.: revenue/average_ticket em branco). Mostra as chaves
            do primeiro item para o time saber como mapear. */}
        {syncDiagnostic && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="sync-diag" className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-medium py-3">
                Diagnóstico da resposta Saipos
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Código HTTP</span>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                    {syncDiagnostic.statusCode ?? 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Tipo da resposta
                  </span>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                    {syncDiagnostic.responseType ?? 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Items extraídos</span>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                    {syncDiagnostic.itemsLength ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    Chaves do objeto (top level)
                  </span>
                  <pre className="mt-1 text-xs font-mono bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                    {(syncDiagnostic.topLevelKeys || []).join(', ') || '(nenhuma)'}
                  </pre>
                </div>
                {(syncDiagnostic.firstItemKeys || []).length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Chaves do 1º item extraído
                    </span>
                    <pre className="mt-1 text-xs font-mono bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                      {(syncDiagnostic.firstItemKeys || []).join(', ')}
                    </pre>
                  </div>
                )}
                {(syncDiagnostic.historyKeys || []).length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Chaves do 1º history (vendas)
                    </span>
                    <pre className="mt-1 text-xs font-mono bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                      {(syncDiagnostic.historyKeys || []).join(', ')}
                    </pre>
                  </div>
                )}
                {syncDiagnostic.rawBodySnippet && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Corpo bruto (até 500 chars)
                    </span>
                    <pre className="mt-1 text-xs font-mono bg-muted p-2 rounded overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                      {syncDiagnostic.rawBodySnippet}
                    </pre>
                  </div>
                )}
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
