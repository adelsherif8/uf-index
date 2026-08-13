-- ============================================================================
-- The official instruments, transcribed exactly as published.
-- Item numbers match the QA workbook columns (PSS1..PSS10, PSQI1..19).
-- ============================================================================

insert into public.questionnaires (code, version) values
  ('WHO5',  '1998'),
  ('PSS10', '1983'),
  ('PSQI',  '1989')
on conflict (code, version) do nothing;

-- ---------------------------------------------------------------- WHO-5 -----
-- "Over the last two weeks…"  0 = At no time … 5 = All of the time
insert into public.questionnaire_items (questionnaire_id, item_no, prompt, min_value, max_value)
select q.id, v.item_no, v.prompt, 0, 5
from public.questionnaires q,
(values
  (1, 'I have felt cheerful and in good spirits'),
  (2, 'I have felt calm and relaxed'),
  (3, 'I have felt active and vigorous'),
  (4, 'I woke up feeling fresh and rested'),
  (5, 'My daily life has been filled with things that interest me')
) as v(item_no, prompt)
where q.code = 'WHO5'
on conflict (questionnaire_id, item_no) do nothing;

-- ---------------------------------------------------------------- PSS-10 ----
-- "In the last month, how often have you…"  0 = Never … 4 = Very often
-- Items 4, 5, 7 and 8 are reverse scored.
insert into public.questionnaire_items
  (questionnaire_id, item_no, prompt, min_value, max_value, reverse_scored)
select q.id, v.item_no, v.prompt, 0, 4, v.rev
from public.questionnaires q,
(values
  (1,  '…been upset because of something that happened unexpectedly?', false),
  (2,  '…felt that you were unable to control the important things in your life?', false),
  (3,  '…felt nervous and "stressed"?', false),
  (4,  '…felt confident about your ability to handle your personal problems?', true),
  (5,  '…felt that things were going your way?', true),
  (6,  '…found that you could not cope with all the things that you had to do?', false),
  (7,  '…been able to control irritations in your life?', true),
  (8,  '…felt that you were on top of things?', true),
  (9,  '…been angered because of things that were outside of your control?', false),
  (10, '…felt difficulties were piling up so high that you could not overcome them?', false)
) as v(item_no, prompt, rev)
where q.code = 'PSS10'
on conflict (questionnaire_id, item_no) do nothing;

-- ------------------------------------------------------------------ PSQI ----
-- Items 1-4 are the sleep times (free entry); 5a-5j are the disturbance
-- frequencies; 6-9 are quality, medication, staying awake and enthusiasm.
insert into public.questionnaire_items
  (questionnaire_id, item_no, prompt, min_value, max_value)
select q.id, v.item_no, v.prompt, v.lo, v.hi
from public.questionnaires q,
(values
  (1,  'Usual bedtime', 0, 1439),
  (2,  'Minutes taken to fall asleep', 0, 600),
  (3,  'Usual wake time', 0, 1439),
  (4,  'Hours of actual sleep per night', 0, 16),
  (5,  'Trouble sleeping: cannot get to sleep within 30 minutes', 0, 3),
  (6,  'Trouble sleeping: wake in the middle of the night or early morning', 0, 3),
  (7,  'Trouble sleeping: have to get up to use the bathroom', 0, 3),
  (8,  'Trouble sleeping: cannot breathe comfortably', 0, 3),
  (9,  'Trouble sleeping: cough or snore loudly', 0, 3),
  (10, 'Trouble sleeping: feel too cold', 0, 3),
  (11, 'Trouble sleeping: feel too hot', 0, 3),
  (12, 'Trouble sleeping: have bad dreams', 0, 3),
  (13, 'Trouble sleeping: have pain', 0, 3),
  (14, 'Trouble sleeping: other reasons', 0, 3),
  (15, 'How would you rate your sleep quality overall?', 0, 3),
  (16, 'How often have you taken medicine to help you sleep?', 0, 3),
  (17, 'How often have you had trouble staying awake while driving, eating or socialising?', 0, 3),
  (18, 'How much of a problem has it been to keep up enough enthusiasm to get things done?', 0, 3),
  (19, 'Do you have a bed partner or room mate?', 0, 3)
) as v(item_no, prompt, lo, hi)
where q.code = 'PSQI'
on conflict (questionnaire_id, item_no) do nothing;
