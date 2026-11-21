export const ACCOUNT_KIND_GROUPS = {
  cash: ['checking', 'savings', 'money_market', 'cd', 'cash'],
  investment: [
    'brokerage',
    'retirement_401k',
    'ira',
    'roth_ira',
    'hsa',
    'education_529',
    'crypto',
  ],
  credit: ['credit_card', 'line_of_credit'],
  loan: ['mortgage', 'auto_loan', 'student_loan', 'personal_loan'],
  property: ['real_estate', 'vehicle'],
  other: ['other'],
} as const

export type AccountKindGroup = keyof typeof ACCOUNT_KIND_GROUPS
export type AccountKind = (typeof ACCOUNT_KIND_GROUPS)[AccountKindGroup][number]

const GROUP_ENTRIES = Object.entries(ACCOUNT_KIND_GROUPS) as [
  AccountKindGroup,
  readonly AccountKind[],
][]

export const ACCOUNT_KINDS: readonly AccountKind[] = GROUP_ENTRIES.flatMap(
  ([, kinds]) => kinds
)

export function accountKindGroup(kind: AccountKind): AccountKindGroup {
  const entry = GROUP_ENTRIES.find(([, kinds]) => kinds.includes(kind))
  if (!entry) throw new Error(`Unknown account kind: ${kind}`)
  return entry[0]
}

export interface Account {
  id: number
  name: string
  kind: AccountKind
  currency: string
  institution: string | null
  accountNumber: string | null
  openedOn: string | null
  closedOn: string | null
  createdAt: string
}

export interface AccountValue {
  accountId: number
  asOf: string
  amountMinor: number
  recordedAt: string
}

export interface AccountWithLatestValue extends Account {
  latestValue: AccountValue | null
}
