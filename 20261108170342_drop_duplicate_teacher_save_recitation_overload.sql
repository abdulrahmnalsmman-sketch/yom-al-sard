/*
# Remove duplicate recitation save function

## What was wrong
- Two versions of teacher_save_recitation_entry existed in the database: an older 12-parameter version and the newer 16-parameter version that adds line, face and recitation-type tracking.
- The app calls the function by name with nine values. Both versions accepted that call, so the database could not choose one and every recitation save failed with a "could not choose" error. This blocked adding surahs to a student's recitation.

## Change
- Drops only the older 12-parameter version. The newer version is kept unchanged.
- No tables, rows, or recorded recitations are changed.
*/

DROP FUNCTION IF EXISTS public.teacher_save_recitation_entry(uuid, uuid, text, text, uuid, uuid, integer, integer, text, integer, integer, uuid);
