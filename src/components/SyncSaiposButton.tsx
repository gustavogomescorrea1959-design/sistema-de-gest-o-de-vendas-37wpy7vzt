import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SyncSaiposDialog } from '@/components/SyncSaiposDialog'

interface SyncSaiposButtonProps {
  onSuccess?: () => void
}

export function SyncSaiposButton({ onSuccess }: SyncSaiposButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RefreshCw className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline">Sincronizar Saipos</span>
        <span className="sm:hidden">Saipos</span>
      </Button>
      <SyncSaiposDialog open={open} onOpenChange={setOpen} onSuccess={onSuccess} />
    </>
  )
}
