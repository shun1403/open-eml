import type { MailAddress } from './types';

const dateFormatter = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function formatAddress({ name, address }: MailAddress): string {
  if (name && address && name !== address) return `${name} <${address}>`;
  return name || address;
}

export function displayName({ name, address }: MailAddress): string {
  return name || address;
}
