import type { Migration } from '../migrate'

export const createAccounts: Migration = {
  name: 'create-accounts',
  sql: `
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(name) > 0),
      kind TEXT NOT NULL CHECK (kind IN (
        'checking', 'savings', 'money_market', 'cd', 'cash',
        'brokerage', 'retirement_401k', 'ira', 'roth_ira', 'hsa',
        'education_529', 'crypto',
        'credit_card', 'line_of_credit',
        'mortgage', 'auto_loan', 'student_loan', 'personal_loan',
        'real_estate', 'vehicle',
        'other'
      )),
      currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
      institution TEXT,
      account_number TEXT,
      opened_on TEXT CHECK (opened_on IS date(opened_on)),
      closed_on TEXT CHECK (closed_on IS date(closed_on)),
      created_at TEXT NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT;

    CREATE TABLE account_values (
      account_id INTEGER NOT NULL REFERENCES accounts (id),
      as_of TEXT NOT NULL
        CHECK (as_of IS strftime('%Y-%m-%dT%H:%M:%fZ', as_of)),
      amount_minor INTEGER NOT NULL,
      recorded_at TEXT NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (account_id, as_of)
    ) STRICT, WITHOUT ROWID;
  `,
}
