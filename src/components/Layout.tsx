import { Outlet, useLocation } from 'react-router-dom'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { Header } from '@/components/Header'
import { useAuth } from '@/hooks/use-auth'

export default function Layout() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated && location.pathname === '/') {
    return <Outlet />
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground overflow-hidden">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <Header />
          <div className="flex-1 overflow-auto animate-fade-in">
            <div className="container mx-auto py-6 px-4 sm:px-6 md:py-8 max-w-7xl">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
