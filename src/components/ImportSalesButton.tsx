import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImportDialog } from '@/components/ImportDialog'

interface ImportSalesButtonProps {
  onSuccess?: () => void
}

export function ImportSalesButton({ onSuccess }: ImportSalesButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-2 h-4 w-4" />
        Importar Vendas
      </Button>
      <ImportDialog open={open} onOpenChange={setOpen} onSuccess={onSuccess} />
    </>
  )
}
