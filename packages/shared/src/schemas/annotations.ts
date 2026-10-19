import { z } from 'zod';

/**
 * Annotations are drawings on the canvas, not steps: a note (free text) and a
 * frame (a titled box behind cards). They live in `_flode_metadata` only and
 * Home Assistant never sees them.
 */
export const ANNOTATION_COLORS = ['yellow', 'blue', 'green', 'red', 'purple', 'gray'] as const;
/** A colour from the six on offer, or any colour picked on the wheel (`#rrggbb`). */
export const AnnotationColorSchema = z.union([
  z.enum(ANNOTATION_COLORS),
  z.string().regex(/^#[0-9a-fA-F]{6}$/),
]);
export type AnnotationColor = z.infer<typeof AnnotationColorSchema>;

const AnnotationBoxSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  color: AnnotationColorSchema.optional().catch(undefined),
});

export const NoteSchema = AnnotationBoxSchema.extend({ text: z.string().default('') });
export type Note = z.infer<typeof NoteSchema>;

export const FrameSchema = AnnotationBoxSchema.extend({ title: z.string().default('') });
export type Frame = z.infer<typeof FrameSchema>;

/** A list of annotations where an entry that fails its schema is dropped, not the whole list. */
export function lenientList<T>(schema: z.ZodType<T>) {
  return z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = schema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    )
    .optional()
    .catch(undefined);
}
