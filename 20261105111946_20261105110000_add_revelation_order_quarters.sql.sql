/*
# Add revelation_order and hizb quarters to Quran metadata

1. Purpose
- Add `revelation_order` column to quran_surahs (from Tanzil metadata).
- Add `hizb_quarter` column to quran_hizb for the 4 quarters within each hizb.
- No data loss — all existing data preserved, only new nullable columns added.

2. Security
- No schema security changes. Columns are nullable with defaults.
*/

-- Add revelation_order to quran_surahs (Tanzil revelation order, different from mushaf order)
ALTER TABLE public.quran_surahs ADD COLUMN IF NOT EXISTS revelation_order integer;

-- Populate revelation_order from Tanzil standard data
UPDATE public.quran_surahs SET revelation_order = data.ro FROM (VALUES
  (1,5),(2,87),(3,89),(4,92),(5,112),(6,55),(7,39),(8,88),(9,113),(10,51),
  (11,52),(12,53),(13,96),(14,72),(15,54),(16,70),(17,50),(18,69),(19,44),(20,45),
  (21,73),(22,103),(23,74),(24,102),(25,42),(26,47),(27,48),(28,49),(29,85),(30,84),
  (31,57),(32,75),(33,90),(34,58),(35,43),(36,41),(37,56),(38,38),(39,59),(40,60),
  (41,61),(42,62),(43,63),(44,64),(45,65),(46,66),(47,95),(48,114),(49,106),(50,34),
  (51,67),(52,76),(53,23),(54,37),(55,97),(56,77),(57,94),(58,105),(59,101),(60,91),
  (61,109),(62,62),(63,104),(64,108),(65,99),(66,107),(67,77),(68,2),(69,78),(70,79),
  (71,71),(72,40),(73,3),(74,4),(75,31),(76,98),(77,33),(78,80),(79,81),(80,24),
  (81,15),(82,82),(83,86),(84,83),(85,27),(86,36),(87,8),(88,68),(89,10),(90,35),
  (91,26),(92,19),(93,11),(94,12),(95,28),(96,1),(97,25),(98,100),(99,93),(100,14),
  (101,30),(102,16),(103,13),(104,32),(105,19),(106,29),(107,17),(108,108),(109,18),(110,21),
  (111,6),(112,22),(113,20),(114,5)
) AS data(sn, ro) WHERE data.sn = quran_surahs.surah_number;

-- Add quarter info to quran_hizb
ALTER TABLE public.quran_hizb ADD COLUMN IF NOT EXISTS quarter_number integer;
ALTER TABLE public.quran_hizb ADD COLUMN IF NOT EXISTS quarter_name text;

-- Each hizb has 4 quarters; update the quarter info
UPDATE public.quran_hizb SET quarter_number = 1, quarter_name = 'الربع الأول' WHERE hizb_number <= 60;
