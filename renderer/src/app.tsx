import { ACCOUNT_KINDS } from '../../src/shared/accounts'
import { formatMinor } from './money'
import { useAddAccount } from './use-add-account'
import { useDbQuery } from './use-db-query'

function AccountList() {
  const accounts = useDbQuery('accounts.list', {})
  if (accounts.status === 'loading') return null
  if (accounts.status === 'error') return <p>{accounts.error.message}</p>
  return (
    <ul>
      {accounts.data.map((account) => (
        <li key={account.id}>
          {account.name} ({account.kind}){' '}
          {account.latestValue
            ? formatMinor(account.latestValue.amountMinor, account.currency)
            : 'no value yet'}
        </li>
      ))}
    </ul>
  )
}

function AddAccountForm() {
  const { submit, error } = useAddAccount()
  return (
    <form onSubmit={submit}>
      <input name="name" placeholder="Account name" required />
      <select name="kind">
        {ACCOUNT_KINDS.map((kind) => (
          <option key={kind}>{kind}</option>
        ))}
      </select>
      <input name="currency" defaultValue="USD" size={3} required />
      <button>Add</button>
      {error && <pre>{error}</pre>}
    </form>
  )
}

export function App() {
  return (
    <main>
      <AddAccountForm />
      <AccountList />
    </main>
  )
}
