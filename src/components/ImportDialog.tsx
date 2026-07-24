import { useState, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  ArrowRight,
} from 'lucide-react'
import { previewSalesImport, confirmSalesImport } from '@/services/api'
import type { ImportPreviewResult, ImportSummary } from '@/services/api'
import { useToast } from '@/hooks/use-toast'

type Step = 'upload' | 'preview' | 'importing' | 'summary'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export function ImportDialog({ open, onOpenChange, onImportComplete }: ImportDialogProps) {
  const [step, setStep] = useState<Step>('upload')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!open) {
      setStep('upload')
      setPreview(null)
      setSummary(null)
      setLoading(false)
    }
  }, [open])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      try {
        const result = await previewSalesImport(file.name, base64)
        setPreview(result)
        setStep('preview')
      } catch {
        toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao processar arquivo.' })
      } finally {
        setLoading(false)
      }
    }
    reader.onerror = () => {
      setLoading(false)
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao ler arquivo.' })
    }
    reader.readAsDataURL(file)
  }

  const handleConfirm = async () => {
    if (!preview) return
    setStep('importing')
    try {
      const result = await confirmSalesImport(preview.groups)
      setSummary(result)
      setStep('summary')
      onImportComplete()
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha na importação.' })
      setStep('preview')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Importar Arquivo de Vendas'}
            {step === 'preview' && 'Pré-visualização da Importação'}
            {step === 'importing' && 'Importando...'}
            {step === 'summary' && 'Resumo da Importação'}
          </DialogTitle>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={handleFileSelect}
        />

        {step === 'upload' && (
          <div className="flex flex-col items-center justify-center py-10 gap-4 border-2 border-dashed border-border rounded-lg">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">Selecione um arquivo CSV ou Excel</p>
              <p className="text-sm text-muted-foreground mt-1">Formatos aceitos: .csv, .xlsx</p>
            </div>
            <Button onClick={() => fileInputRef.current?.click()} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Selecionar Arquivo
            </Button>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Data: {preview.columns.date || 'N/A'}</Badge>
              <Badge variant="secondary">Canal: {preview.columns.channel || 'N/A'}</Badge>
              <Badge variant="secondary">Pedido: {preview.columns.orderType || 'N/A'}</Badge>
              <Badge variant="secondary">Receita: {preview.columns.revenue || 'N/A'}</Badge>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                Total de linhas: <strong>{preview.totalRows}</strong>
              </span>
              <span>
                Linhas ignoradas: <strong>{preview.skippedRows}</strong>
              </span>
              <span>
                Grupos a importar: <strong>{preview.groups.length}</strong>
              </span>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Canal</th>
                    <th className="px-3 py-2 text-right">Pedidos</th>
                    <th className="px-3 py-2 text-right">Faturamento</th>
                    <th className="px-3 py-2 text-right">Tkt Médio</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.groups.map((g, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-2">{g.date}</td>
                      <td className="px-3 py-2">{g.channel}</td>
                      <td className="px-3 py-2 text-right">{g.orders}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(g.revenue)}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(g.average_ticket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Processando importação...</p>
          </div>
        )}

        {step === 'summary' && summary && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                <div>
                  <p className="text-2xl font-bold text-emerald-700">{summary.created}</p>
                  <p className="text-sm text-emerald-600">Registros criados</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
                <CheckCircle2 className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-700">{summary.updated}</p>
                  <p className="text-sm text-blue-600">Registros atualizados</p>
                </div>
              </div>
            </div>
            {summary.errors.length > 0 && (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <p className="font-medium text-amber-800">{summary.errors.length} erro(s)</p>
                </div>
                <ul className="text-sm text-amber-700 space-y-1">
                  {summary.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>
                      {err.date} - {err.channel}: {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === 'preview' && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm}>
              Confirmar Importação
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </DialogFooter>
        )}

        {step === 'summary' && (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
