import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** One colour per seat. */
export const COLORS = ['#ff4500', '#0079d3', '#46d160', '#ffb000'];
