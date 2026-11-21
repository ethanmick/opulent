import { useState, type FormEvent } from 'react'
import type { AccountKind } from '../../src/shared/accounts'
import { call } from './db'

export function useAddAccount() {
  const [error, setError] = useState<string>()

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    try {
      await call('accounts.create', {
        name: String(fields.get('name')),
        kind: fields.get('kind') as AccountKind,
        currency: String(fields.get('currency')),
      })
      form.reset()
      setError(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return { submit, error }
}
