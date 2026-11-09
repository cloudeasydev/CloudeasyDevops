import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useOutletContext, useParams } from "@/lib/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Confirm, Input, Modal, Select, Textarea } from "@/components/ui/primitives";
import { INTERVIEW_TOPICS } from "@/lib/interviewQuestions";
import { api, type User } from "@/lib/api";
import { cn } from "@/lib/utils";

type AnswerMap = Record<string, string[]>;

type Library = {
  topics: Array<{ id: string; title: string; short: string }>;
  questions: Array<{ id: string; topicId: string; text: string }>;
  overrides: Record<string, string>;
  topicOverrides: Record<string, { title?: string; short?: string }>;
  hiddenQuestions: string[];
  hiddenTopics: string[];
};

type Question = { id: string; text: string; custom: boolean };
type Topic = { id: string; title: string; short: string; custom: boolean; questions: Question[] };

const emptyLibrary: Library = {
  topics: [],
  questions: [],
  overrides: {},
  topicOverrides: {},
  hiddenQuestions: [],
  hiddenTopics: [],
};

function hasAnswer(points: string[] | undefined) {
  return Boolean(points?.some((point) => point.trim()));
}

function mergeTopics(library: Library): Topic[] {
  const hiddenQuestions = new Set(library.hiddenQuestions);
  const hiddenTopics = new Set(library.hiddenTopics);
  const built = INTERVIEW_TOPICS.filter((topic) => !hiddenTopics.has(topic.id)).map((topic) => {
    const override = library.topicOverrides[topic.id];
    const questions: Question[] = [
      ...topic.questions
        .filter((question) => !hiddenQuestions.has(question.id))
        .map((question) => ({ id: question.id, text: library.overrides[question.id] || question.text, custom: false })),
      ...library.questions
        .filter((question) => question.topicId === topic.id)
        .map((question) => ({ id: question.id, text: question.text, custom: true })),
    ];
    return {
      id: topic.id,
      title: override?.title || topic.title,
      short: override?.short || topic.short,
      custom: false,
      questions,
    };
  });
  const custom = library.topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    short: topic.short,
    custom: true,
    questions: library.questions
      .filter((question) => question.topicId === topic.id)
      .map((question) => ({ id: question.id, text: question.text, custom: true })),
  }));
  return [...built, ...custom];
}

export function InterviewPage() {
  const { user } = useOutletContext<{ user: User }>();
  const { topicId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [draft, setDraft] = useState<string[]>([""]);
  const [answersReady, setAnswersReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [questionForm, setQuestionForm] = useState<{ id?: string; topicId: string; text: string } | null>(null);
  const [topicForm, setTopicForm] = useState<{ id?: string; title: string; short: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "question" | "topic"; id: string; label: string } | null>(null);

  const libraryQuery = useQuery({
    queryKey: ["interview-library", user.id],
    queryFn: () => api<Library>("/api/interview/library"),
  });
  const library = libraryQuery.data ?? emptyLibrary;
  const topics = useMemo(() => mergeTopics(library), [library]);
  const selectedTopic = topics.find((item) => item.id === topicId) ?? topics[0];

  useEffect(() => {
    let cancelled = false;
    setAnswersReady(false);
    void api<{ answers: AnswerMap }>("/api/interview/answers")
      .then((res) => {
        if (cancelled) return;
        setAnswers(res.answers && typeof res.answers === "object" ? res.answers : {});
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

  const refreshLibrary = () => qc.invalidateQueries({ queryKey: ["interview-library", user.id] });

  const saveQuestion = useMutation({
    mutationFn: async () => {
      if (!questionForm) return;
      const text = questionForm.text.trim();
      if (text.length < 3) throw new Error("Question must be at least 3 characters");
      if (questionForm.id) {
        return api(`/api/interview/questions/${encodeURIComponent(questionForm.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ text }),
        });
      }
      return api("/api/interview/questions", {
        method: "POST",
        body: JSON.stringify({ topicId: questionForm.topicId, text }),
      });
    },
    onSuccess: () => {
      toast.success(questionForm?.id ? "Question updated" : "Question added");
      setQuestionForm(null);
      refreshLibrary();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveTopic = useMutation({
    mutationFn: async () => {
      if (!topicForm) return;
      const title = topicForm.title.trim();
      const short = topicForm.short.trim() || title.slice(0, 18);
      if (title.length < 2) throw new Error("Topic name must be at least 2 characters");
      if (topicForm.id) {
        return api(`/api/interview/topics/${encodeURIComponent(topicForm.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ title, short }),
        });
      }
      return api<{ topic: { id: string } }>("/api/interview/topics", {
        method: "POST",
        body: JSON.stringify({ title, short }),
      });
    },
    onSuccess: (result) => {
      toast.success(topicForm?.id ? "Topic updated" : "Topic added");
      setTopicForm(null);
      refreshLibrary();
      const created = result && typeof result === "object" && "topic" in result ? result.topic : null;
      if (created?.id) nav(`/interview/${created.id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeItem = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return;
      const base = deleteTarget.kind === "topic" ? "topics" : "questions";
      return api(`/api/interview/${base}/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
    },
    onSuccess: () => {
      if (deleteTarget?.kind === "question") {
        setAnswers((current) => {
          const next = { ...current };
          delete next[deleteTarget.id];
          return next;
        });
        if (activeId === deleteTarget.id) setActiveId(null);
      }
      toast.success(deleteTarget?.kind === "topic" ? "Topic removed" : "Question removed");
      setDeleteTarget(null);
      refreshLibrary();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const visibleQuestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!selectedTopic) return [];
    if (!needle) return selectedTopic.questions.map((question) => ({ topic: selectedTopic, question }));
    return topics.flatMap((topicItem) =>
      topicItem.questions
        .filter((question) => question.text.toLowerCase().includes(needle))
        .map((question) => ({ topic: topicItem, question })),
    );
  }, [query, selectedTopic, topics]);

  const active = useMemo(() => {
    if (!activeId) return null;
    for (const topicItem of topics) {
      const question = topicItem.questions.find((item) => item.id === activeId);
      if (question) return { topic: topicItem, question };
    }
    return null;
  }, [activeId, topics]);

  const answeredCount = (topicItem: Topic) => topicItem.questions.filter((question) => hasAnswer(answers[question.id])).length;
  const totalAnswered = topics.reduce((sum, topicItem) => sum + answeredCount(topicItem), 0);
  const totalQuestions = topics.reduce((sum, topicItem) => sum + topicItem.questions.length, 0);

  const openQuestion = (question: Question) => {
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

  const addPoint = () => setDraft((current) => [...current, ""]);

  const removePoint = (index: number) => {
    if (!active) return;
    const next = draft.filter((_, pointIndex) => pointIndex !== index);
    const points = next.length ? next : [""];
    setDraft(points);
    saveDraft(active.question.id, points);
  };

  if (!libraryQuery.isLoading && topicId && !topics.some((item) => item.id === topicId)) {
    return <Navigate to={topics[0] ? `/interview/${topics[0].id}` : "/interview/iam"} replace />;
  }

  return (
    <div className="flex min-h-[480px] flex-col gap-4 lg:h-[calc(100vh-7rem)]">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Interview</h1>
          <p className="page-desc mt-1">
            {totalAnswered} of {totalQuestions} answered. Add, edit, or delete questions, and write your own answers. They are saved to your account.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setTopicForm({ title: "", short: "" })}>
            <Plus className="h-4 w-4" /> Topic
          </Button>
          <Button
            type="button"
            onClick={() => selectedTopic && setQuestionForm({ topicId: selectedTopic.id, text: "" })}
            disabled={!selectedTopic}
          >
            <Plus className="h-4 w-4" /> Question
          </Button>
        </div>
      </div>

      <div className="grid min-h-[420px] flex-1 grid-cols-1 overflow-hidden rounded-xl border border-line bg-panel lg:min-h-0 lg:grid-cols-[minmax(0,260px)_1fr]">
        <aside className="flex max-h-64 flex-col overflow-hidden border-b border-line lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-line px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">Topics</div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {topics.length === 0 ? <div className="px-2 py-3 text-sm text-muted">No topics yet. Add one to start.</div> : null}
            {topics.map((topicItem) => {
              const done = answeredCount(topicItem);
              const activeTopic = topicItem.id === selectedTopic?.id;
              return (
                <div
                  key={topicItem.id}
                  className={cn(
                    "flex items-center gap-1 rounded-md pr-1",
                    activeTopic ? "bg-accent/10" : "hover-surface",
                  )}
                >
                  <Link
                    to={`/interview/${topicItem.id}`}
                    onClick={() => setQuery("")}
                    className={cn(
                      "flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1.5 text-left text-sm",
                      activeTopic ? "font-medium text-accent-text" : "text-muted hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{topicItem.short}</span>
                    <span className="shrink-0 text-[10px] text-faint">
                      {done}/{topicItem.questions.length}
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-foreground"
                    aria-label={`Edit ${topicItem.short}`}
                    onClick={() => setTopicForm({ id: topicItem.id, title: topicItem.title, short: topicItem.short })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-rose-500"
                    aria-label={`Delete ${topicItem.short}`}
                    onClick={() => setDeleteTarget({ kind: "topic", id: topicItem.id, label: topicItem.title })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-[280px] flex-col overflow-hidden">
          <div className="flex shrink-0 flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{query.trim() ? "Search" : selectedTopic?.title ?? "Interview"}</div>
              <p className="text-xs text-muted">
                {query.trim()
                  ? `${visibleQuestions.length} matching questions`
                  : selectedTopic
                    ? `${answeredCount(selectedTopic)} of ${selectedTopic.questions.length} answered`
                    : "Add a topic to begin"}
              </p>
            </div>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions" className="h-8 sm:max-w-xs" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {visibleQuestions.length === 0 ? (
              <div className="p-4 text-sm text-muted">{selectedTopic ? "No questions in this topic yet." : "No matching questions"}</div>
            ) : (
              <ol className="space-y-2">
                {visibleQuestions.map(({ topic: topicItem, question }, index) => {
                  const points = (answers[question.id] ?? []).filter((point) => point.trim());
                  const showTopic = Boolean(query.trim());
                  return (
                    <li key={question.id}>
                      <div className="rounded-lg border border-line px-3 py-3 hover-surface">
                        <div className="flex items-start gap-2">
                          <button type="button" onClick={() => openQuestion(question)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                            <span className="mt-0.5 text-xs text-faint">{index + 1}.</span>
                            <span className="min-w-0 flex-1">
                              {showTopic ? <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-faint">{topicItem.short}</span> : null}
                              <span className="text-sm text-foreground">{question.text}</span>
                            </span>
                            {points.length > 0 ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> : null}
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-muted hover:text-foreground"
                            aria-label="Edit question"
                            onClick={() => setQuestionForm({ id: question.id, topicId: topicItem.id, text: question.text })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-muted hover:text-rose-500"
                            aria-label="Delete question"
                            onClick={() => setDeleteTarget({ kind: "question", id: question.id, label: question.text })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {points.length > 0 ? (
                          <button type="button" onClick={() => openQuestion(question)} className="mt-2 w-full text-left">
                            <ul className="space-y-1 pl-5">
                              {points.slice(0, 3).map((point, pointIndex) => (
                                <li key={`${question.id}-${pointIndex}`} className="truncate text-xs text-muted">
                                  • {point}
                                </li>
                              ))}
                              {points.length > 3 ? <li className="text-xs text-faint">+{points.length - 3} more</li> : null}
                            </ul>
                          </button>
                        ) : (
                          <button type="button" onClick={() => openQuestion(question)} className="mt-2 pl-5 text-xs text-link">
                            Write your answer
                          </button>
                        )}
                      </div>
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
            <p className="mt-1 text-xs text-muted">Write your own answer, one point per line. It is saved to your account.</p>
            <div className="mt-4 space-y-2">
              {draft.map((point, index) => (
                <div key={`${active.question.id}-${index}`} className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-xs text-muted">{index + 1}.</span>
                  <Textarea value={point} rows={2} placeholder={`Point ${index + 1}`} onChange={(e) => updatePoint(index, e.target.value)} />
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

      <Modal open={Boolean(questionForm)} title={questionForm?.id ? "Edit question" : "Add question"} onClose={() => setQuestionForm(null)}>
        {questionForm ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveQuestion.mutate();
            }}
          >
            {!questionForm.id ? (
              <label className="block text-sm">
                <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Topic</span>
                <Select value={questionForm.topicId} onChange={(event) => setQuestionForm({ ...questionForm, topicId: event.target.value })}>
                  {topics.map((topicItem) => (
                    <option key={topicItem.id} value={topicItem.id}>
                      {topicItem.title}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Question</span>
              <Textarea
                value={questionForm.text}
                rows={4}
                placeholder="What do you want to practice?"
                onChange={(event) => setQuestionForm({ ...questionForm, text: event.target.value })}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setQuestionForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveQuestion.isPending || questionForm.text.trim().length < 3}>
                {saveQuestion.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={Boolean(topicForm)} title={topicForm?.id ? "Edit topic" : "Add topic"} onClose={() => setTopicForm(null)}>
        {topicForm ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveTopic.mutate();
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Name</span>
              <Input value={topicForm.title} onChange={(event) => setTopicForm({ ...topicForm, title: event.target.value })} placeholder="Kubernetes troubleshooting" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Short label</span>
              <Input value={topicForm.short} onChange={(event) => setTopicForm({ ...topicForm, short: event.target.value })} placeholder="K8s" />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setTopicForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveTopic.isPending || topicForm.title.trim().length < 2}>
                {saveTopic.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Confirm
        open={Boolean(deleteTarget)}
        title={deleteTarget?.kind === "topic" ? "Delete topic?" : "Delete question?"}
        body={
          deleteTarget?.kind === "topic"
            ? `Remove “${deleteTarget.label}” and its questions from your interview list. Your answers for those questions are deleted too.`
            : `Remove “${deleteTarget?.label ?? "this question"}” from your list. Your answer for it is deleted too.`
        }
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => removeItem.mutate()}
      />
    </div>
  );
}
