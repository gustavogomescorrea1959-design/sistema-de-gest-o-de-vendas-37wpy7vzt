import { useState, useRef, type ChangeEvent } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { parseFile, type ParsedFile } from '@/lib/file-parser'
import {
  detectColumns,
  importSales,
  type ImportResult,
  type ColumnMapping,
} from '@/lib/sales-importer'

type Step = 'idle' | 'parsing' | 'preview' | 'importing' | 'summary' | 'error'

export function ImportSalesButton({ onImported }: { onImported: () => void }) {
  const [step, setStep] = useState<Step>('idle')
  const [parsedData, setParsedData] = useState<ParsedFile | null>(null)
  const [cols, setCols] = useState<ColumnMapping | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStep('parsing')
    try {
      const data = await parseFile(file)
      const detected = detectColumns(data.headers)
      setParsedData(data)
      setCols(detected)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo')
      setStep('error')
    }
    e.target.value = ''
  }

  const handleImport = async () => {
    if (!parsedData || !cols) return
    setStep('importing')
    try {
      const res = await importSales(parsedData.rows, cols)
      setResult(res)
      setStep('summary')
      onImported()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar dados')
      setStep('error')
    }
  }

  const handleClose = () => {
    setStep('idle')
    setParsedData(null)
    setResult(null)
    setError('')
  }

  const sampleRows = parsedData ? parsedData.rows.slice(0, 5) : []

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={step === 'parsing' || step === 'importing'}
      >
        {step === 'parsing' ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Upload className="h-4 w-4 mr-2" />
        )}
        Importar Arquivo
      </Button>

      <Dialog
        open={step !== 'idle'}
        onOpenChange={(v) => {
          if (!v && step !== 'importing') handleClose()
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {step === 'preview' && cols && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Pré-visualização da Importação
                </DialogTitle>
                <DialogDescription>
                  {parsedData?.rows.length || 0} linhas detectadas. Confira o mapeamento de colunas.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {(
                    [
                      ['Data da venda', cols.dateCol, true],
                      ['Canal de venda', cols.channelCol, false],
                      ['Pedido', cols.pedidoCol, false],
                      ['Total (R$)', cols.revenueCol, true],
                    ] as const
                  ).map(([label, val, required]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-md border p-2"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <Badge
                        variant={!val && required ? 'destructive' : val ? 'default' : 'secondary'}
                      >
                        {val || (required ? 'Não encontrado' : 'Opcional')}
                      </Badge>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data da venda</TableHead>
                        <TableHead>Canal</TableHead>
                        <TableHead>Pedido</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sampleRows.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{row[cols.dateCol] || '-'}</TableCell>
                          <TableCell className="text-xs">{row[cols.channelCol] || '-'}</TableCell>
                          <TableCell className="text-xs">{row[cols.pedidoCol] || '-'}</TableCell>
                          <TableCell className="text-xs text-right">
                            {row[cols.revenueCol] || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button onClick={handleImport} disabled={!cols.dateCol || !cols.revenueCol}>
                  Confirmar Importação
                </Button>
              </div>
            </>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Processando importação...</p>
            </div>
          )}

          {step === 'summary' && result && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  Importação Concluída
                </DialogTitle>
                <DialogDescription>Resumo do processamento do arquivo.</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-2xl font-bold">{result.totalRows}</p>
                  <p className="text-xs text-muted-foreground">Linhas lidas</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-600">
                    {result.created + result.updated}
                  </p>
                  <p className="text-xs text-muted-foreground">Registros salvos</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-2xl font-bold">{result.created}</p>
                  <p className="text-xs text-muted-foreground">Criados</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-2xl font-bold">{result.updated}</p>
                  <p className="text-xs text-muted-foreground">Atualizados</p>
                </div>
              </div>

              {result.skipped > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-800">
                      {result.skipped} linha(s) ignorada(s)
                    </span>
                  </div>
                  {result.errors.length > 0 && (
                    <ul className="text-xs text-amber-700 space-y-1 max-h-32 overflow-y-auto">
                      {result.errors.slice(0, 20).map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                      {result.errors.length > 20 && (
                        <li>... e mais {result.errors.length - 20} itens</li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={handleClose}>Fechar</Button>
              </div>
            </>
          )}

          {step === 'error' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <X className="h-5 w-5" /> Erro na Importação
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{error}</p>
              <div className="flex justify-end pt-2">
                <Button onClick={handleClose}>Fechar</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
