import type postgres from "postgres";

export const A = "10000000-0000-4000-8000-000000000001";
export const B = "10000000-0000-4000-8000-000000000002";
export const TCF_SET = "20000000-0000-4000-8000-000000000001";
export const TCF_Q = "20000000-0000-4000-8000-000000000002";
export const GAP_A = "30000000-0000-4000-8000-000000000001";
export const GAP_B = "30000000-0000-4000-8000-000000000002";
export const LEGACY_EXAM = "40000000-0000-4000-8000-000000000001";

export async function seed(sql: postgres.Sql) {
  for (const [owner, suffix] of [[A, "a"], [B, "b"]]) {
    await sql`insert into users (id,auth_issuer,auth_subject,email) values (${owner},'synthetic',${suffix},${suffix + "@example.invalid"})`;
    await sql`insert into quiz_sets (id,user_id,exam,section,title) values (${"quiz-" + suffix},${owner},'synthetic','reading','Synthetic quiz')`;
    await sql`insert into quiz_passages (id,set_id,text) values (${"passage-" + suffix},${"quiz-" + suffix},'Bonjour.')`;
    for (const n of [1, 2]) await sql`insert into quiz_questions (id,passage_id,type,question_text,options,answer)
      values (${`q-${suffix}-${n}`},${"passage-" + suffix},'single','Synthetic choice','["Bonjour", "Bonsoir"]'::jsonb,'0'::jsonb)`;
    await sql`insert into quiz_attempts (id,user_id,set_id,score,total,answered_at)
      values (${"legacy-quiz-" + suffix},${owner},${"quiz-" + suffix},1,2,'2026-01-01T12:00:00Z')`;
    await sql`insert into writing_tasks (id,user_id,prompt_en,target_words,target_grammar)
      values (${"task-" + suffix},${owner},'Write a synthetic sentence','[]','[]')`;
    await sql`insert into submissions (id,user_id,task_id,content_fr)
      values (${"submission-" + suffix},${owner},${"task-" + suffix},'Je est ici.')`;
    await sql`insert into errors (id,user_id,submission_id,span_start,span_end,original,correction,category,subcategory,explanation_en,micro_drill)
      values (${"error-" + suffix},${owner},${"submission-" + suffix},3,6,'est','suis','Grammar','conjugation_present','Synthetic explanation','Complete: je ... ici')`;
    await sql`insert into micro_drills (id,user_id,error_id,prompt_text,response_fr,feedback_json,created_at)
      values (${"legacy-drill-" + suffix},${owner},${"error-" + suffix},'Synthetic prompt','Je suis ici.','{"ok":true,"comments":["Synthetic"],"better_examples":[]}','2026-01-02T12:00:00Z')`;
    await sql`insert into user_vocabulary (user_id,lemma,surface,translation) values (${owner},'bonjour','bonjour','hello')`;
    await sql`insert into vocabulary_gaps (id,user_id,lemma,gap_type,source,due_at)
      values (${suffix === "a" ? GAP_A : GAP_B},${owner},'bonjour','recognition','manual','2026-01-01T12:00:00Z')`;
    await sql`insert into conjugation_attempts (id,user_id,verb,tense,person,user_input,expected,correct,answered_at)
      values (${"legacy-conjugation-" + suffix},${owner},'être','présent',0,'est','suis',false,'2026-01-01T12:00:00Z')`;
  }
  await sql`insert into quiz_sets (id,user_id,exam,section,title) values ('cloze-a',${A},'podcast','dictation','Synthetic cloze')`;
  await sql`insert into quiz_passages (id,set_id,text) values ('cloze-p','cloze-a','Bonjour école')`;
  await sql`insert into quiz_questions (id,passage_id,type,question_text,answer) values ('cloze-q','cloze-p','fill_blank','école','["école"]'::jsonb)`;
  await sql`insert into tcf_sets (id,test_number,skill,title) values (${TCF_SET},9999,'reading','Synthetic TCF')`;
  await sql`insert into tcf_questions (id,set_id,order_index,level,type,question_text,options,answer)
    values (${TCF_Q},${TCF_SET},1,'A1','reading_mcq','Synthetic question','["Bonjour","Bonsoir"]',0)`;
  await sql`insert into tcf_attempts (id,user_id,set_id,skill,test_number,score,total,answered_at)
    values (${LEGACY_EXAM},${A},${TCF_SET},'reading',9999,1,1,'2026-01-01T12:00:00Z')`;
  await sql`insert into tcf_question_attempts (user_id,question_id,mode,exam_attempt_id,chosen,correct,answered_at)
    values (${A},${TCF_Q},'exam',${LEGACY_EXAM},0,true,'2026-01-01T12:00:00Z')`;
}

// Global lexical entry precedes owner-specific rows in seed().
export async function seedLexicon(sql: postgres.Sql) {
  await sql`insert into vocabulary_lookups (id,lemma,surface) values ('synthetic-bonjour','bonjour','bonjour')`;
}
