import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { parseSalesFile } from '@/lib/file-parser'
import { previewImport, confirmImport, type SalesPreviewGroup } from '@/lib/sales-importer'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export function ImportDialog({ open, onOpenChange, onSuccess }: ImportDialogProps) {
  const [parsing, setParsing] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [preview, setPreview] = useState<SalesPreviewGroup[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setPreview([])
    setError(null)
    setSuccess(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setSuccess(null)
    setParsing(true)
    try {
      const rows = await parseSalesFile(file)
      setPreviewing(true)
      const groups = await previewImport(rows)
      setPreview(groups)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo')
      setPreview([])
    } finally {
      setParsing(false)
      setPreviewing(false)
    }
  }

  const handleConfirm = async () => {
    setConfirming(true)
    setError(null)
    try {
      const result = await confirmImport(preview)
      setSuccess(`${result.created} registro(s) criado(s) e ${result.updated} atualizado(s).`)
      setPreview([])
      if (inputRef.current) inputRef.current.value = ''
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar dados')
    } finally {
      setConfirming(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) reset()
    onOpenChange(open)
  }

  const totalRevenue = preview.reduce((sum, g) => sum + g.revenue, 0)
  const totalOrders = preview.reduce((sum, g) => sum + g.orders, 0)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Vendas</DialogTitle>
          <DialogDescription>
            Selecione um arquivo CSV exportado da sua planilha de vendas.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-500 bg-green-50 text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 cursor-pointer hover:border-muted-foreground/50 transition-colors"
          >
            {parsing || previewing ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              {parsing
                ? 'Processando arquivo...'
                : previewing
                  ? 'Gerando prévia...'
                  : 'Clique para selecionar um arquivo CSV'}
            </p>
            <p className="text-xs text-muted-foreground/70">Formatos aceitos: CSV</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileSelect}
          />

          {preview.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="font-medium">{preview.length} grupo(s)</span>
                <span className="text-muted-foreground">{totalOrders} pedido(s)</span>
                <span className="text-muted-foreground">{formatCurrency(totalRevenue)}</span>
              </div>
              <div className="rounded-md border max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">Ticket Médio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((g, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{g.date}</TableCell>
                        <TableCell>{g.channel}</TableCell>
                        <TableCell className="text-right">{g.orders}</TableCell>
                        <TableCell className="text-right">{formatCurrency(g.revenue)}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(g.average_ticket)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Fechar
          </Button>
          {preview.length > 0 && (
            <Button onClick={handleConfirm} disabled={confirming}>
              {confirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Confirmar Importação
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
