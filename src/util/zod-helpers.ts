/**
 * Zod refine that enforces the project-wide "every filter tool needs at
 * least one substantive filter" rule. Without this, callers will accidentally
 * pull whole sources and trip the byte cap.
 *
 * Usage:
 *   z.object({ skill: z.string().optional(), keyword: z.string().optional(), ... })
 *     .refine(requireAtLeastOneFilter('skill', 'keyword', ...), {
 *       message: 'find_X requires at least one filter field',
 *     });
 */
export function requireAtLeastOneFilter<K extends string>(
  ...keys: K[]
): (value: Partial<Record<K, unknown>>) => boolean {
  return (value) => keys.some((k) => value[k] !== undefined);
}
