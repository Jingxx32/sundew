export const dynamic = "force-dynamic";

import { KeyRound, CheckCircle, XCircle, ExternalLink, GraduationCap, Mic, Target } from "lucide-react";
import { testApiKey, getCefrLevel, getSpeakingProfile, getStudyGoal } from "@/lib/actions/settings";
import { TestApiKeyButton } from "./_components/test-api-key-button";
import { CefrLevelPicker } from "./_components/cefr-level-picker";
import { SpeakingProfileEditor } from "./_components/speaking-profile-editor";
import { StudyGoalEditor } from "./_components/study-goal-editor";
import { requireUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const user = await requireUser();
  const [status, cefrLevel, speakingProfile, studyGoal] = await Promise.all([
    user.role === "admin" ? testApiKey() : Promise.resolve(null),
    getCefrLevel(),
    getSpeakingProfile(),
    getStudyGoal(),
  ]);

  return (
    <div className="px-10 py-10 max-w-2xl mx-auto">
      <h1 className="text-[38px] font-bold tracking-[-0.035em] mb-1">
        Settings
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        Configuration for AI features and your learner profile.
      </p>

      {status && <section className="rounded-2xl bg-surface shadow-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">OpenAI API Key</h2>
        </div>

        {status.ok ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>Key configured and verified</span>
            </div>
            <div className="rounded-lg bg-surface-muted px-4 py-2.5 font-mono text-xs text-muted-foreground tracking-wider">
              {status.maskedKey}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Word lookup</span>
                <span className="font-mono">{status.models.lookup}</span>
              </div>
              <div className="flex justify-between">
                <span>Task generation</span>
                <span className="font-mono">{status.models.task}</span>
              </div>
              <div className="flex justify-between">
                <span>Writing feedback</span>
                <span className="font-mono">{status.models.feedback}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-danger">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{status.error}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Add your key to <code className="font-mono text-foreground">.env</code> as{" "}
              <code className="font-mono text-foreground">OPENAI_API_KEY=sk-…</code> and restart the dev server.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <TestApiKeyButton />
          <a
            href="https://platform.openai.com/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View usage on OpenAI
          </a>
        </div>
      </section>}

      <section className={`rounded-2xl bg-surface shadow-card p-6 space-y-5 ${status ? "mt-6" : ""}`}>
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Your CEFR Level</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Sets the difficulty of AI-generated writing tasks. The AI also estimates your level after
          each submission — this is your self-declared baseline.
        </p>
        <CefrLevelPicker currentLevel={cefrLevel} />
      </section>

      <section className="rounded-2xl bg-surface shadow-card p-6 space-y-5 mt-6">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Study goal</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Choose daily French practice or TCF preparation. Exam details remain optional.
        </p>
        <StudyGoalEditor initial={studyGoal} />
      </section>

      <section className="rounded-2xl bg-surface shadow-card p-6 space-y-5 mt-6">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Speaking Profile</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Personal background used to generate TCF speaking scripts — job, city, family,
          immigration goals, hobbies, go-to anecdotes. Any language.
        </p>
        <SpeakingProfileEditor initialValue={speakingProfile} />
      </section>
    </div>
  );
}
