import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'

export type AppModuleId = 'dashboard' | 'vendas-diarias' | 'metas' | 'historico' | 'usuarios'

export interface AppModuleDefinition {
  id: AppModuleId
  label: string
  description: string
  path: string
  adminOnly?: boolean
}

export const ALL_APP_MODULES: AppModuleDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Quadro geral com acompanhamento do mês e gráficos de vendas',
    path: '/dashboard',
  },
  {
    id: 'vendas-diarias',
    label: 'Vendas Diárias',
    description: 'Lançamento e importação de vendas dia a dia',
    path: '/vendas-diarias',
  },
  {
    id: 'metas',
    label: 'Metas',
    description: 'Metas mensais por canal e recálculo automático',
    path: '/metas',
  },
  {
    id: 'historico',
    label: 'Histórico',
    description: 'Relatório histórico consolidado das vendas por canal e mês',
    path: '/historico',
  },
  {
    id: 'usuarios',
    label: 'Usuários',
    description: 'Gestão de usuários e permissões de acesso (apenas Admin)',
    path: '/usuarios',
    adminOnly: true,
  },
]

export const DEFAULT_USER_MODULES: AppModuleId[] = [
  'dashboard',
  'vendas-diarias',
  'metas',
  'historico',
]

export interface UserPermissionRecord extends RecordModel {
  user: string
  pages: AppModuleId[]
  created: string
  updated: string
}

/**
 * Busca as permissões de um usuário específico pelo ID de usuário.
 */
export const getUserPermissions = async (userId: string): Promise<UserPermissionRecord | null> => {
  try {
    const record = await pb
      .collection('user_permissions')
      .getFirstListItem<UserPermissionRecord>(`user = '${userId}'`)
    return record
  } catch {
    return null
  }
}

/**
 * Busca todas as permissões de todos os usuários (apenas admin).
 */
export const getAllUserPermissions = async (): Promise<Record<string, AppModuleId[]>> => {
  try {
    const list = await pb.collection('user_permissions').getFullList<UserPermissionRecord>()
    const map: Record<string, AppModuleId[]> = {}
    for (const item of list) {
      const pages = Array.isArray(item.pages) ? item.pages : []
      map[item.user] = pages as AppModuleId[]
    }
    return map
  } catch (err) {
    console.error('Erro ao buscar lista de permissões:', err)
    return {}
  }
}

/**
 * Atualiza ou cria as permissões de um usuário no PocketBase.
 * Admin apenas.
 */
export const saveUserPermissions = async (userId: string, pages: AppModuleId[]): Promise<void> => {
  try {
    const existing = await pb
      .collection('user_permissions')
      .getFirstListItem<UserPermissionRecord>(`user = '${userId}'`)
    await pb.collection('user_permissions').update(existing.id, {
      pages,
    })
  } catch {
    // Se não existir registro ainda para o usuário, cria um novo
    await pb.collection('user_permissions').create({
      user: userId,
      pages,
    })
  }
}
