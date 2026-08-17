import type { Session } from '@/lib/session/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { useNavigate, Link } from 'react-router'
import { useSetAtom } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'
import { ThemeToggle } from '@/components/theme-toggle'
import { Settings } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

interface RateLimitInfo {
  used: number
  total: number
  remaining: number
}

export function SignOut({ user, authProvider }: Pick<Session, 'user' | 'authProvider'>) {
  void authProvider
  const navigate = useNavigate()
  const setSession = useSetAtom(sessionAtom)
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null)

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' })
    } catch {}
    toast.success('You have been logged out.')
    setSession({ user: undefined })
    navigate('/', { replace: true })
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const response = await fetch('/api/auth/rate-limit', { credentials: 'include' })
        if (response.ok && mounted) {
          const data = await response.json()
          setRateLimit({ used: data.used, total: data.total, remaining: data.remaining })
        }
      } catch {}
    })()
    return () => {
      mounted = false
    }
  }, [])

  const fetchRateLimit = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/rate-limit', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setRateLimit({ used: data.used, total: data.total, remaining: data.remaining })
      }
    } catch {}
  }, [])

  return (
    <DropdownMenu onOpenChange={(open) => open && fetchRateLimit()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary rounded-full"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.avatar ? `${user.avatar}&s=72` : undefined} alt={user.username} />
            <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-2">
          <div className="text-sm font-medium">
            <span>{user.name ?? user.username}</span>
          </div>
          {user.email && <div className="text-sm text-muted-foreground">{user.email}</div>}
          {rateLimit && (
            <div className="text-xs text-muted-foreground mt-1">
              {rateLimit.remaining}/{rateLimit.total} messages remaining today
            </div>
          )}
        </div>

        <DropdownMenuSeparator />

        <ThemeToggle />

        {/* Admin link */}
        {user.role === 'admin' && (
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to="/admin">
              <Settings className="h-4 w-4 mr-2" />
              管理后台
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          登出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
