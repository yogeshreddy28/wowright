export function normalizeIndianPhone(input: string) {
  const digits = input.replace(/\D/g, '');
  const local =
    digits.startsWith('91') && digits.length === 12
      ? digits.slice(2)
      : digits.startsWith('0') && digits.length === 11
        ? digits.slice(1)
        : digits;
  if (!/^[6-9]\d{9}$/.test(local))
    throw new Error('Enter a valid 10-digit Indian mobile number');
  return `91${local}`;
}
