import type { DepartmentWeights } from '../types';

/**
 * Returns admin-configured criterion definition for the employee hover popup on the panel icon.
 * Matches `content` item by exact label (trimmed), then case-insensitive normalized match.
 */
export function getCriterionDefinitionFromWeights(
  weights: DepartmentWeights | undefined,
  department: string,
  categoryName: string,
  criterionLabel: string,
  fallback: string
): string {
  const cat = weights?.[department]?.find((c) => c.label === categoryName);
  const items = cat?.content;
  if (!items?.length) return fallback;

  const trim = (s: string) => s.trim();
  const exact = items.find((c) => trim(c.label) === trim(criterionLabel));
  const fromExact = (exact as { ui?: { definition?: string } } | undefined)?.ui?.definition;
  if (typeof fromExact === 'string' && trim(fromExact)) return trim(fromExact);

  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[—–]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  const nLabel = norm(criterionLabel);
  const loose = items.find((c) => norm(c.label) === nLabel);
  const fromLoose = (loose as { ui?: { definition?: string } } | undefined)?.ui?.definition;
  if (typeof fromLoose === 'string' && trim(fromLoose)) return trim(fromLoose);

  return fallback;
}
