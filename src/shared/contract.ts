import { z } from 'zod'
import {
  ACCOUNT_KINDS,
  type Account,
  type AccountValue,
  type AccountWithLatestValue,
} from './accounts'

export type TableName = 'accounts' | 'account_values'

interface OperationDef {
  mode: 'read' | 'write'
  /** Tables a read depends on, or a write changes. */
  tables: readonly TableName[]
  input: z.ZodType
}

export interface OperationOutputs {
  'accounts.create': Account
  'accounts.close': Account
  'accounts.list': AccountWithLatestValue[]
  'accountValues.record': AccountValue
  'accountValues.history': AccountValue[]
}

const text = z.string().trim().min(1)
const optionalText = text.nullable().default(null)
const isoDate = z.iso.date()
const id = z.int().positive()

// Canonical UTC form, so that text order in SQLite is chronological order.
const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString())

export const operations = {
  'accounts.create': {
    mode: 'write',
    tables: ['accounts'],
    input: z.strictObject({
      name: text,
      kind: z.enum(ACCOUNT_KINDS),
      currency: z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 code'),
      institution: optionalText,
      accountNumber: optionalText,
      openedOn: isoDate.nullable().default(null),
    }),
  },
  'accounts.close': {
    mode: 'write',
    tables: ['accounts'],
    input: z.strictObject({ id, closedOn: isoDate }),
  },
  'accounts.list': {
    mode: 'read',
    tables: ['accounts', 'account_values'],
    input: z.strictObject({}),
  },
  'accountValues.record': {
    mode: 'write',
    tables: ['account_values'],
    input: z.strictObject({
      accountId: id,
      asOf: instant,
      amountMinor: z.int(),
    }),
  },
  'accountValues.history': {
    mode: 'read',
    tables: ['account_values'],
    input: z.strictObject({ accountId: id }),
  },
} as const satisfies Record<keyof OperationOutputs, OperationDef>

export type OperationName = keyof OperationOutputs
export type ReadOperationName = {
  [N in OperationName]: (typeof operations)[N]['mode'] extends 'read'
    ? N
    : never
}[OperationName]
export type OperationInput<N extends OperationName> = z.input<
  (typeof operations)[N]['input']
>
export type OperationArgs<N extends OperationName> = z.output<
  (typeof operations)[N]['input']
>
export type OperationOutput<N extends OperationName> = OperationOutputs[N]

export function isOperationName(name: unknown): name is OperationName {
  return typeof name === 'string' && Object.hasOwn(operations, name)
}

export type DbErrorCode =
  | 'forbidden'
  | 'unknown_operation'
  | 'invalid_input'
  | 'not_found'
  | 'constraint'
  | 'unavailable'
  | 'internal'

export interface DbErrorShape {
  code: DbErrorCode
  message: string
}

export type DbResult<T> =
  { ok: true; output: T } | { ok: false; error: DbErrorShape }

export class DbError extends Error {
  readonly code: DbErrorCode

  constructor(code: DbErrorCode, message: string) {
    super(message)
    this.name = 'DbError'
    this.code = code
  }
}

export const DB_CALL_CHANNEL = 'db:call'
export const DB_CHANGED_CHANNEL = 'db:changed'

/** What the preload script exposes to the renderer as `window.db`. */
export interface DbApi {
  call(name: string, input: unknown): Promise<DbResult<unknown>>
  onChange(listener: (tables: TableName[]) => void): () => void
}
