import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Target, LineChart, Users, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { AppModuleId } from '@/services/permissions'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import logoAlecrim from '@/assets/icone-alecrim-c1c5d.png'

interface NavItem {
  id: AppModuleId
  title: string
  icon: typeof LayoutDashboard
  url: string
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, url: '/dashboard' },
  { id: 'vendas-diarias', title: 'Vendas Diárias', icon: ClipboardList, url: '/vendas-diarias' },
  { id: 'metas', title: 'Metas', icon: Target, url: '/metas' },
  { id: 'historico', title: 'Histórico', icon: LineChart, url: '/historico' },
  { id: 'usuarios', title: 'Usuários', icon: Users, url: '/usuarios', adminOnly: true },
]

export function AppSidebar() {
  const location = useLocation()
  const { user, signOut, isAdmin, canAccess } = useAuth()
  const { setOpenMobile } = useSidebar()

  const handleLinkClick = () => {
    setOpenMobile(false)
  }

  // Sidebar filtra dinamicamente pelos módulos permitidos para o usuário atual:
  // Admin sempre vê todos; usuário comum vê apenas o que o admin liberou.
  const visibleNavItems = navItems.filter((item) => {
    if (isAdmin) return true
    if (item.adminOnly) return false
    return canAccess(item.id)
  })

  return (
    <Sidebar className="border-r border-border/50">
      <SidebarHeader className="p-4 border-b border-border/50 h-16 flex items-center">
        <div className="flex items-center gap-2 font-bold text-lg text-primary-foreground">
          <img src={logoAlecrim} alt="Logo Alecrim" className="h-8 w-8 object-contain" />
          <span className="text-foreground">Gestão de Vendas</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="pt-4">
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <Link
                      to={item.url}
                      onClick={handleLinkClick}
                      className="flex items-center gap-3 transition-colors duration-200"
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-border/50">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-9 w-9 bg-primary/10 text-primary font-bold">
            <AvatarFallback>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-medium truncate">{user?.name || 'Usuário'}</span>
            <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
          </div>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          <span>Sair da conta</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  )
}
