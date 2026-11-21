import type { Migration } from '../migrate'
import { createAccounts } from './0001-create-accounts'

/** Append only. A shipped migration is never edited or reordered. */
export const MIGRATIONS: readonly Migration[] = [createAccounts]
