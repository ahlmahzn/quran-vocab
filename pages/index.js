import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(words) {
  return shuffle(words).map((word) => {
    const others = words.filter((w) => w.id !== word.id);
    const distractors = shuffle(others).slice(0, 3).map((w) => w.meaning);
    const options = shuffle([word.meaning, ...distractors]);
    return { word, options, correct: word.meaning };
  });
}

export default function App() {
  const [tab, setTab] = useState("list");
  const [words, setWords] = useState(null);
  const [toast, setToast] = useState("");
  const [adding, setAdding] = useState(false);

  // quiz state
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [quizDone, setQuizDone] = useState(false);
  const [quizCount, setQuizCount] = useState(20);
  const [quizFilter, setQuizFilter] = useState("all");

  const loadWords = useCallback(async () => {
    const { data, error } = await supabase
      .from("words")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setWords(data || []);
    else { console.error(error); setWords([]); }
  }, []);

  useEffect(() => { loadWords(); }, [loadWords]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("words-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "words" }, () => loadWords())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadWords]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    const fd = new FormData(e.target);
    const arabic = fd.get("arabic").trim();
    const meaning = fd.get("meaning").trim();
    const root = fd.get("root").trim();
    const added_by = fd.get("addedBy").trim();
    const surah = fd.get("surah").trim();
    if (!arabic || !meaning) { setAdding(false); return; }
    const { error } = await supabase.from("words").insert([{ arabic, meaning, root: root || null, added_by: added_by || null, surah: surah || null }]);
    if (!error) { e.target.reset(); showToast("Word added! ✓"); await loadWords(); }
    else showToast("Error adding word");
    setAdding(false);
  };

  const handleDelete = async (id) => {
    await supabase.from("words").delete().eq("id", id);
    await loadWords();
  };

  const startQuiz = () => {
    let pool = words || [];
    if (quizFilter !== "all") pool = pool.filter(w => w.added_by === quizFilter);
    if (pool.length < 4) { showToast("Need at least 4 words to quiz!"); return; }
    const count = Math.min(quizCount, pool.length);
    const qs = buildQuestions(shuffle(pool).slice(0, count));
    setQuestions(qs);
    setQIndex(0);
    setSelected(null);
    setAnswers([]);
    setQuizDone(false);
  };

  const handleAnswer = (opt) => {
    if (selected) return;
    setSelected(opt);
    const q = questions[qIndex];
    const isCorrect = opt === q.correct;
    const newAnswers = [...answers, { word: q.word, selected: opt, correct: q.correct, isCorrect }];
    setAnswers(newAnswers);
    setTimeout(() => {
      if (qIndex + 1 >= questions.length) setQuizDone(true);
      else { setQIndex(i => i + 1); setSelected(null); }
    }, 900);
  };

  const contributors = words ? [...new Set(words.filter(w => w.added_by).map(w => w.added_by))] : [];

  return (
    <>
      <div className="app">
        <header className="header">
          <div className="header-ornament">﷽</div>
          <h1>Quran Vocabulary</h1>
          <p>Daily words · Group study · Shared learning</p>
        </header>

        <nav className="tabs">
          {[["list","📖 Word List"],["add","✏️ Add Word"],["quiz","🌙 Quiz"]].map(([id, label]) => (
            <button key={id} className={`tab ${tab===id?"active":""}`} onClick={() => { setTab(id); setQuestions([]); }}>{label}</button>
          ))}
        </nav>

        {words === null && <div className="loading">Loading shared vocabulary…</div>}

        {words !== null && tab === "list" && <WordList words={words} onDelete={handleDelete} />}

        {words !== null && tab === "add" && (
          <div className="add-form">
            <h2>✦ Add a New Word</h2>
            <form onSubmit={handleAdd}>
              <div className="form-row">
                <div className="field">
                  <label>Arabic Word *</label>
                  <input name="arabic" className="arabic" placeholder="كَتَبَ" required />
                </div>
                <div className="field">
                  <label>Meaning *</label>
                  <input name="meaning" placeholder="he wrote" required />
                </div>
                <div className="field">
                  <label>Root (optional)</label>
                  <input name="root" className="arabic" placeholder="ك ت ب" />
                </div>
              </div>
              <div className="form-row-2">
                <div className="field">
                  <label>Your Name</label>
                  <input name="addedBy" placeholder="e.g. Fatima" />
                </div>
                <div className="field">
                  <label>Surah / Source</label>
                  <input name="surah" placeholder="e.g. Al-Baqarah 2:2" />
                </div>
                <div className="field">
                  <label>&nbsp;</label>
                  <button type="submit" className="submit-btn" disabled={adding}>
                    {adding ? "Adding…" : "Add Word"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {words !== null && tab === "quiz" && (
          questions.length === 0 ? (
            <div className="quiz-setup">
              <h2>✦ Vocabulary Quiz</h2>
              <p>Test yourself on the group&apos;s collected words</p>
              {(words.length < 4) ? (
                <p style={{color:"var(--rose)"}}>Add at least 4 words before starting a quiz.</p>
              ) : (
                <>
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:".78rem",color:"var(--muted)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Number of questions</div>
                    <div className="quiz-options">
                      {[10,20,30,"All"].map(n => (
                        <button key={n} className={`quiz-option-btn ${quizCount===(n==="All"?9999:n)?"selected":""}`}
                          onClick={() => setQuizCount(n==="All"?9999:n)}>{n}</button>
                      ))}
                    </div>
                  </div>
                  {contributors.length > 1 && (
                    <div style={{marginBottom:20}}>
                      <div style={{fontSize:".78rem",color:"var(--muted)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Filter by contributor</div>
                      <div className="quiz-options">
                        <button className={`quiz-option-btn ${quizFilter==="all"?"selected":""}`} onClick={() => setQuizFilter("all")}>All</button>
                        {contributors.map(c => (
                          <button key={c} className={`quiz-option-btn ${quizFilter===c?"selected":""}`} onClick={() => setQuizFilter(c)}>{c}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button className="start-quiz-btn" onClick={startQuiz}>Begin Quiz ✦</button>
                </>
              )}
            </div>
          ) : quizDone ? (
            <Results answers={answers} onRetry={() => { setQuestions([]); setTimeout(startQuiz, 50); }} onBack={() => setQuestions([])} />
          ) : (
            <QuizQuestion q={questions[qIndex]} total={questions.length} index={qIndex} selected={selected} onAnswer={handleAnswer} />
          )
        )}
      </div>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </>
  );
}

function WordList({ words, onDelete }) {
  const [search, setSearch] = useState("");
  const filtered = words.filter(w =>
    w.arabic.includes(search) ||
    w.meaning.toLowerCase().includes(search.toLowerCase()) ||
    (w.root || "").includes(search) ||
    (w.added_by || "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <div className="list-header">
        <h2>✦ All Words</h2>
        <span className="count-badge">{words.length} word{words.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input placeholder="Search words, meanings, contributors…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📖</div>
          <p>{words.length === 0 ? "No words yet. Be the first to add one!" : "No matches found."}</p>
        </div>
      ) : (
        <div className="word-grid">
          {filtered.map(w => (
            <div key={w.id} className="word-card">
              <div className="arabic-text">{w.arabic}</div>
              <div className="word-info">
                <div className="word-meaning">{w.meaning}</div>
                <div className="word-meta">
                  {w.root && <span className="meta-chip root">Root: {w.root}</span>}
                  {w.surah && <span className="meta-chip">{w.surah}</span>}
                  {w.added_by && <span className="meta-chip added-by">by {w.added_by}</span>}
                  {w.created_at && <span className="meta-chip">{new Date(w.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                </div>
              </div>
              <button className="delete-btn" onClick={() => onDelete(w.id)} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuizQuestion({ q, total, index, selected, onAnswer }) {
  const pct = ((index / total) * 100).toFixed(1) + "%";
  return (
    <div>
      <div className="quiz-progress">
        <div className="progress-bar"><div className="progress-fill" style={{width: pct}} /></div>
        <div className="progress-label">{index + 1} / {total}</div>
      </div>
      <div className="quiz-card">
        <div className="quiz-question-label">What does this word mean?</div>
        <div className="quiz-arabic">{q.word.arabic}</div>
        {q.word.surah && <div className="quiz-surah">{q.word.surah}</div>}
        <div className="answer-grid">
          {q.options.map(opt => {
            let cls = "answer-btn";
            if (selected) {
              if (opt === q.correct) cls += " correct";
              else if (opt === selected) cls += " wrong";
            }
            return <button key={opt} className={cls} onClick={() => onAnswer(opt)} disabled={!!selected}>{opt}</button>;
          })}
        </div>
      </div>
    </div>
  );
}

function Results({ answers, onRetry, onBack }) {
  const correct = answers.filter(a => a.isCorrect).length;
  const pct = Math.round((correct / answers.length) * 100);
  const grade = pct === 100 ? "Perfect! ماشاء الله" : pct >= 80 ? "Excellent! 🌟" : pct >= 60 ? "Good effort! Keep going" : "Keep reviewing!";
  return (
    <div className="results">
      <div className="score-circle">
        <div className="score-number">{pct}%</div>
      </div>
      <h2>{grade}</h2>
      <p>{correct} of {answers.length} correct</p>
      <div className="result-list">
        {answers.map((a, i) => (
          <div key={i} className="result-item">
            <span>{a.isCorrect ? "✅" : "❌"}</span>
            <span className="result-arabic">{a.word.arabic}</span>
            <span className="result-meaning">{a.correct}</span>
            {!a.isCorrect && <span className="result-wrong">You said: {a.selected}</span>}
          </div>
        ))}
      </div>
      <div className="btn-row">
        <button className="retry-btn" onClick={onRetry}>Retry Quiz</button>
        <button className="back-btn" onClick={onBack}>Change Settings</button>
      </div>
    </div>
  );
}
