'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * Subscribes to Supabase Realtime for:
 *  - feature_flags(id='default') changes
 *  - worker_message_prefs changes for the current user
 * On any change, triggers router.refresh() so downstream components remount and
 * re-fetch /api/feature-flags (which returns the effective permission for the user).
 */
export default function PermissionWatcher() {
  const router = useRouter()

  useEffect(() => {
    const supabase = supabaseBrowser()
    let mounted = true

    async function run() {
      // get current user id
      const { data: u } = await supabase.auth.getUser()
      const uid = u?.user?.id

      const subs: any[] = []

      // feature_flags 'default'
      subs.push(
        supabase
          .channel('ff-worker-messaging')
          .on(
            'postgres_changes',
                  { event: '*', schema: 'public', table: 'feature_flags', filter: 'id=eq.worker_messaging' },


            () => mounted && router.refresh()
          )
          .subscribe()
      )

      // worker_message_prefs for this user
      if (uid) {
        subs.push(
          supabase
            .channel('wmp-self')
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'worker_message_prefs', filter: `worker_id=eq.${uid}` },
              () => mounted && router.refresh()
            )
            .subscribe()
        )
      }
    }

    run()

    return () => {
      mounted = false
      // Supabase SSR client auto-cleans channels on GC/unmount; nothing else needed.
    }
  }, [router])

  return null
}
