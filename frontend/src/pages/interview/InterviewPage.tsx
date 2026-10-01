import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button, Input, Modal, Textarea } from "@/components/ui/primitives";
import { INTERVIEW_TOPICS, type InterviewQuestion, type InterviewTopic } from "@/lib/interviewQuestions";
import type { User } from "@/lib/api";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type AnswerMap = Record<string, string[]>;

function hasAnswer(points: string[] | undefined) {
  return Boolean(points?.some((point) => point.trim()));
}

export function InterviewPage() {
  const { user } = useOutletContext<{ user: User }>();
  const { topicId } = useParams();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [draft, setDraft] = useState<string[]>([""]);
  const [answersReady, setAnswersReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedTopic = INTERVIEW_TOPICS.find((item) => item.id === topicId) ?? INTERVIEW_TOPICS[0]!;

  useEffect(() => {
    let cancelled = false;
    setAnswersReady(false);
    void api<{ answers: AnswerMap }>("/api/interview/answers")
      .then((res) => {
        if (cancelled) return;
        const next = res.answers && typeof res.answers === "object" ? res.answers : {};
        setAnswers(next);
        setAnswersReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setAnswers({});
          setAnswersReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    if (!answersReady) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void api("/api/interview/answers", {
        method: "PUT",
        body: JSON.stringify({ answers }),
      }).catch(() => {
        /* best-effort sync */
      });
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [answers, answersReady, user.id]);

  const visibleQuestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return selectedTopic.questions.map((question) => ({ topic: selectedTopic, question }));
    return INTERVIEW_TOPICS.flatMap((topicItem) =>
      topicItem.questions
        .filter((question) => question.text.toLowerCase().includes(needle))
        .map((question) => ({ topic: topicItem, question })),
    );
  }, [query, selectedTopic]);

  const active = useMemo(() => {
    if (!activeId) return null;
    for (const topicItem of INTERVIEW_TOPICS) {
      const question = topicItem.questions.find((item) => item.id === activeId);
      if (question) return { topic: topicItem, question };
    }
    return null;
  }, [activeId]);

  const answeredCount = (topicItem: InterviewTopic) =>
    topicItem.questions.filter((question) => hasAnswer(answers[question.id])).length;

  const totalAnswered = INTERVIEW_TOPICS.reduce((sum, topicItem) => sum + answeredCount(topicItem), 0);
  const totalQuestions = INTERVIEW_TOPICS.reduce((sum, topicItem) => sum + topicItem.questions.length, 0);

  const openQuestion = (question: InterviewQuestion) => {
    const existing = answers[question.id]?.filter((point) => point.trim()) ?? [];
    setDraft(existing.length ? existing : [""]);
    setActiveId(question.id);
  };

  const saveDraft = (questionId: string, points: string[]) => {
    const meaningful = points.map((point) => point.trim()).filter(Boolean);
    setAnswers((current) => {
      const next = { ...current };
      if (meaningful.length === 0) delete next[questionId];
      else next[questionId] = meaningful;
      return next;
    });
  };

  const updatePoint = (index: number, value: string) => {
    if (!active) return;
    const next = draft.map((point, pointIndex) => (pointIndex === index ? value : point));
    setDraft(next);
    saveDraft(active.question.id, next);
  };

  const addPoint = () => {
    setDraft((current) => [...current, ""]);
  };

  const removePoint = (index: number) => {
    if (!active) return;
    const next = draft.filter((_, pointIndex) => pointIndex !== index);
    const points = next.length ? next : [""];
    setDraft(points);
    saveDraft(active.question.id, points);
  };

  if (topicId && !INTERVIEW_TOPICS.some((item) => item.id === topicId)) {
    return <Navigate to="/interview/iam" replace />;
  }

  return (
    <div className="flex min-h-[480px] flex-col gap-4 lg:h-[calc(100vh-7rem)]">
      <div className="shrink-0">
        <h1 className="page-title">Interview</h1>
        <p className="page-desc mt-1">
          {totalAnswered} of {totalQuestions} answered. All topics and questions are available to every signed-in user.
        </p>
      </div>

      <div className="grid min-h-[420px] flex-1 grid-cols-1 overflow-hidden rounded-xl border border-line bg-panel lg:min-h-0 lg:grid-cols-[minmax(0,240px)_1fr]">
        <aside className="flex max-h-56 flex-col overflow-hidden border-b border-line lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-line px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">Topics</div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {INTERVIEW_TOPICS.map((topicItem) => {
              const done = answeredCount(topicItem);
              const activeTopic = topicItem.id === selectedTopic.id;
              return (
                <Link
                  key={topicItem.id}
                  to={`/interview/${topicItem.id}`}
                  onClick={() => setQuery("")}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    activeTopic ? "bg-accent/10 font-medium text-accent-text" : "text-muted hover-surface hover:text-foreground",
                  )}
                >
                  <span className="truncate">{topicItem.short}</span>
                  <span className="shrink-0 text-[10px] text-faint">
                    {done}/{topicItem.questions.length}
                  </span>
                </Link>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-[280px] flex-col overflow-hidden">
          <div className="flex shrink-0 flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{query.trim() ? "Search" : selectedTopic.title}</div>
              <p className="text-xs text-muted">
                {query.trim()
                  ? `${visibleQuestions.length} matching questions`
                  : `${answeredCount(selectedTopic)} of ${selectedTopic.questions.length} answered`}
              </p>
            </div>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions" className="h-8 sm:max-w-xs" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {visibleQuestions.length === 0 ? (
              <div className="p-4 text-sm text-muted">No matching questions</div>
            ) : (
              <ol className="space-y-2">
                {visibleQuestions.map(({ topic: topicItem, question }, index) => {
                  const points = (answers[question.id] ?? []).filter((point) => point.trim());
                  const showTopic = Boolean(query.trim());
                  return (
                    <li key={question.id}>
                      <button
                        type="button"
                        onClick={() => openQuestion(question)}
                        className="w-full rounded-lg border border-line px-3 py-3 text-left hover-surface"
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 text-xs text-faint">{index + 1}.</span>
                          <span className="min-w-0 flex-1">
                            {showTopic ? <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-faint">{topicItem.short}</span> : null}
                            <span className="text-sm text-foreground">{question.text}</span>
                          </span>
                          {points.length > 0 ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> : null}
                        </div>
                        {points.length > 0 ? (
                          <ul className="mt-2 space-y-1 pl-5">
                            {points.slice(0, 3).map((point, pointIndex) => (
                              <li key={`${question.id}-${pointIndex}`} className="truncate text-xs text-muted">
                                • {point}
                              </li>
                            ))}
                            {points.length > 3 ? <li className="text-xs text-faint">+{points.length - 3} more</li> : null}
                          </ul>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      </div>

      <Modal open={Boolean(active)} title={active ? active.topic.short : "Answer"} onClose={() => setActiveId(null)} wide>
        {active ? (
          <div>
            <p className="text-sm font-medium leading-relaxed text-foreground">{active.question.text}</p>
            <p className="mt-1 text-xs text-muted">Write one point per line. Answers stay in this browser.</p>
            <div className="mt-4 space-y-2">
              {draft.map((point, index) => (
                <div key={`${active.question.id}-${index}`} className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-xs text-muted">{index + 1}.</span>
                  <Textarea
                    value={point}
                    rows={2}
                    placeholder={`Point ${index + 1}`}
                    onChange={(e) => updatePoint(index, e.target.value)}
                  />
                  <button
                    type="button"
                    className="mt-2 rounded-md p-1.5 text-muted hover:text-rose-500"
                    aria-label={`Remove point ${index + 1}`}
                    onClick={() => removePoint(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addPoint}>
                <Plus className="h-3.5 w-3.5" />
                Add point
              </Button>
              <Button type="button" size="sm" onClick={() => setActiveId(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
