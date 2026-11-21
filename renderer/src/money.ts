export function formatMinor(
  amountMinor: number,
  currency: string,
  locale?: string
): string {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency })
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2
  return format.format(amountMinor / 10 ** digits)
}
