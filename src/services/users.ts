import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'

export interface UserRecord extends RecordModel {
  name: string
  email: string
  role: 'admin' | 'user' | ''
  active: boolean
  verified: boolean
  created: string
  updated: string
}

/**
 * Retorna true se o usuário autenticado atual é admin (role = 'admin').
 * Superusers também contam como admin.
 */
export const isAdmin = (): boolean => {
  const auth = pb.authStore.record
  if (!auth) return false
  // Superuser
  if (typeof (auth as any).isSuperuser === 'function' && (auth as any).isSuperuser()) {
    return true
  }
  return (auth as any).role === 'admin'
}

/**
 * Lista todos os usuários (apenas visível para admin — regra RLS garante no
 * backend; se um usuário comum chamar, recebe só o próprio registro).
 */
export const getUsers = async (): Promise<UserRecord[]> => {
  const list = await pb.collection('users').getFullList<UserRecord>({
    sort: '-created',
  })
  return list
}

/**
 * Cria um novo usuário via endpoint do admin. Validação de email único e
 * senha >= 8 acontece no servidor (pocketbase/hooks/users_create.js).
 */
export const createUser = async (data: {
  name: string
  email: string
  password: string
}): Promise<UserRecord> => {
  return pb.send('/backend/v1/users/create', {
    method: 'POST',
    body: data,
  })
}

/**
 * Redefine a senha de um usuário. Acesso só para admin (regra updateRule
 * da collection `users` = "@request.auth.role = 'admin'").
 */
export const resetUserPassword = async (id: string, newPassword: string): Promise<void> => {
  await pb.collection('users').update(id, {
    password: newPassword,
    passwordConfirm: newPassword,
  })
}

/**
 * Ativa/desativa um usuário. toggle = true => ativa, false => desativa.
 */
export const setUserActive = async (id: string, active: boolean): Promise<void> => {
  await pb.collection('users').update(id, { active })
}
