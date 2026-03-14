import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const SURAH_NAMES = {
  1:"Al-Fatihah",2:"Al-Baqarah",3:"Ali 'Imran",4:"An-Nisa",5:"Al-Ma'idah",
  6:"Al-An'am",7:"Al-A'raf",8:"Al-Anfal",9:"At-Tawbah",10:"Yunus",
  11:"Hud",12:"Yusuf",13:"Ar-Ra'd",14:"Ibrahim",15:"Al-Hijr",
  16:"An-Nahl",17:"Al-Isra",18:"Al-Kahf",19:"Maryam",20:"Ta-Ha",
  21:"Al-Anbiya",22:"Al-Hajj",23:"Al-Mu'minun",24:"An-Nur",25:"Al-Furqan",
  26:"Ash-Shu'ara",27:"An-Naml",28:"Al-Qasas",29:"Al-Ankabut",30:"Ar-Rum",
  31:"Luqman",32:"As-Sajdah",33:"Al-Ahzab",34:"Saba",35:"Fatir",
  36:"Ya-Sin",37:"As-Saffat",38:"Sad",39:"Az-Zumar",40:"Ghafir",
  41:"Fussilat",42:"Ash-Shura",43:"Az-Zukhruf",44:"Ad-Dukhan",45:"Al-Jathiyah",
  46:"Al-Ahqaf",47:"Muhammad",48:"Al-Fath",49:"Al-Hujurat",50:"Qaf",
  51:"Adh-Dhariyat",52:"At-Tur",53:"An-Najm",54:"Al-Qamar",55:"Ar-Rahman",
  56:"Al-Waqi'ah",57:"Al-Hadid",58:"Al-Mujadila",59:"Al-Hashr",60:"Al-Mumtahanah",
  61:"As-Saf",62:"Al-Jumu'ah",63:"Al-Munafiqun",64:"At-Taghabun",65:"At-Talaq",
  66:"At-Tahrim",67:"Al-Mulk",68:"Al-Qalam",69:"Al-Haqqah",70:"Al-Ma'arij",
  71:"Nuh",72:"Al-Jinn",73:"Al-Muzzammil",74:"Al-Muddaththir",75:"Al-Qiyamah",
  76:"Al-Insan",77:"Al-Mursalat",78:"An-Naba",79:"An-Nazi'at",80:"Abasa",
  81:"At-Takwir",82:"Al-Infitar",83:"Al-Mutaffifin",84:"Al-Inshiqaq",85:"Al-Buruj",
  86:"At-Tariq",87:"Al-A'la",88:"Al-Ghashiyah",89:"Al-Fajr",90:"Al-Balad",
  91:"Ash-Shams",92:"Al-Layl",93:"Ad-Duhaa",94:"Ash-Sharh",95:"At-Tin",
  96:"Al-Alaq",97:"Al-Qadr",98:"Al-Bayyinah",99:"Az-Zalzalah",100:"Al-Adiyat",
  101:"Al-Qari'ah",102:"At-Takathur",103:"Al-Asr",104:"Al-Humazah",105:"Al-Fil",
  106:"Quraysh",107:"Al-Ma'un",108:"Al-Kawthar",109:"Al-Kafirun",110:"An-Nasr",
  111:"Al-Masad",112:"Al-Ikhlas",113:"Al-Falaq",114:"An-Nas"
};

// Strip Arabic diacritics (tashkeel) for cleaner display
function stripDiacritics(text) {
  return text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "");
}

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

  // quiz
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [quizDone, setQuizDone] = useState(false);
  const [quizCount, setQuizCount] = useState(20);
  const [quizFilter, setQuizFilter] = useState("all");

  // verse lookup
  const [surahNum, setSurahNum] = useState("");
  const [ayahNum, setAyahNum] = useState("");
  const [verseData, setVerseData] = useState(null);
  const [verseLoading, setVerseLoading] = useState(false);
  const [verseError, setVerseError] = useState("");
  const [selectedWordIdx, setSelectedWordIdx] = useState(null);
  const [wordAddedBy, setWordAddedBy] = useState("");
  const [savingWord, setSavingWord] = useState(false);

  const loadWords = useCallback(async () => {
    const { data, error } = await supabase
      .from("words").select("*").order("created_at", { ascending: false });
    if (!error) setWords(data || []);
    else { console.error(error); setWords([]); }
  }, []);

  useEffect(() => { loadWords(); }, [loadWords]);

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

  // Fetch word-by-word data from Quran Foundation API
  const fetchVerse = async () => {
    const s = parseInt(surahNum);
    const a = parseInt(ayahNum);
    if (!s || !a || s < 1 || s > 114 || a < 1) {
      setVerseError("Please enter a valid Surah (1–114) and Ayah number.");
      return;
    }
    setVerseLoading(true);
    setVerseError("");
    setVerseData(null);
    setSelectedWordIdx(null);
    try {
      // Quran Foundation API — returns word-by-word with translation per word
      const res = await fetch(
        `https://api.quran.com/api/v4/verses/by_key/${s}:${a}?words=true&word_fields=text_uthmani,text_indopak&translations=131&transliteration=true`
      );
      const json = await res.json();
      if (!json.verse || !json.verse.words) {
        setVerseError("Verse not found. Please check the Surah and Ayah numbers.");
      } else {
        const verse = json.verse;
        // Filter out non-word tokens (end marker etc.)
        const wordList = verse.words
          .filter(w => w.char_type_name === "word")
          .map(w => ({
            arabic: stripDiacritics(w.text_uthmani || w.text_indopak || ""),
            arabicFull: w.text_uthmani || "",
            meaning: w.translation?.text || "",
            transliteration: w.transliteration?.text || "",
          }));
        const fullTranslation = verse.translations?.[0]?.text?.replace(/<[^>]+>/g, "") || "";
        const surahName = SURAH_NAMES[s] || `Surah ${s}`;
        setVerseData({ wordList, fullTranslation, surahName, surah: s, ayah: a });
      }
    } catch {
      setVerseError("Could not load verse. Please check your connection and try again.");
    }
    setVerseLoading(false);
  };

  const saveWord = async () => {
    if (selectedWordIdx === null || !verseData) return;
    const w = verseData.wordList[selectedWordIdx];
    if (!w.meaning) return;
    setSavingWord(true);
    const surahRef = `${verseData.surahName} ${verseData.surah}:${verseData.ayah}`;
    const { error } = await supabase.from("words").insert([{
      arabic: w.arabic,
      meaning: w.meaning,
      root: null,
      added_by: wordAddedBy.trim() || null,
      surah: surahRef,
    }]);
    if (!error) {
      showToast(`"${w.arabic}" added! ✓`);
      setSelectedWordIdx(null);
      await loadWords();
    } else {
      showToast("Error saving word");
    }
    setSavingWord(false);
  };

  const handleManualAdd = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const arabic = fd.get("arabic").trim();
    const meaning = fd.get("meaning").trim();
    const root = fd.get("root").trim();
    const added_by = fd.get("addedBy").trim();
    const surah = fd.get("surah").trim();
    if (!arabic || !meaning) return;
    const { error } = await supabase.from("words").insert([{
      arabic, meaning, root: root || null, added_by: added_by || null, surah: surah || null
    }]);
    if (!error) { e.target.reset(); showToast("Word added! ✓"); await loadWords(); }
    else showToast("Error adding word");
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
    setQuestions(qs); setQIndex(0); setSelected(null); setAnswers([]); setQuizDone(false);
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
  const selectedWord = selectedWordIdx !== null && verseData ? verseData.wordList[selectedWordIdx] : null;

  return (
    <>
      <div className="app">
        <header className="header">
          <div className="header-ornament">﷽</div>
          <h1>Quran Vocabulary</h1>
          <p>Daily words · Group study · Shared learning</p>
        </header>

        <nav className="tabs">
          {[["list","📖 Word List"],["verse","🔍 Verse Lookup"],["add","✏️ Add Manually"],["quiz","🌙 Quiz"]].map(([id, label]) => (
            <button key={id} className={`tab ${tab===id?"active":""}`} onClick={() => { setTab(id); setQuestions([]); }}>{label}</button>
          ))}
        </nav>

        {words === null && <div className="loading">Loading shared vocabulary…</div>}

        {/* ── WORD LIST ── */}
        {words !== null && tab === "list" && <WordList words={words} onDelete={handleDelete} />}

        {/* ── VERSE LOOKUP ── */}
        {words !== null && tab === "verse" && (
          <div>
            <div className="add-form">
              <h2>✦ Add Words from a Verse</h2>
              <p style={{color:"var(--muted)",fontSize:".88rem",marginBottom:18}}>
                Enter a Surah and Ayah number, then <strong style={{color:"var(--gold)"}}>tap any Arabic word</strong> — its English meaning highlights automatically. Confirm to save it.
              </p>
              <div className="verse-lookup-row">
                <div className="field">
                  <label>Surah (1–114)</label>
                  <input type="number" min="1" max="114" value={surahNum}
                    onChange={e => setSurahNum(e.target.value)} placeholder="e.g. 2"
                    onKeyDown={e => e.key === "Enter" && fetchVerse()} />
                </div>
                <div className="field">
                  <label>Ayah Number</label>
                  <input type="number" min="1" value={ayahNum}
                    onChange={e => setAyahNum(e.target.value)} placeholder="e.g. 255"
                    onKeyDown={e => e.key === "Enter" && fetchVerse()} />
                </div>
                <div className="field">
                  <label>&nbsp;</label>
                  <button className="submit-btn" onClick={fetchVerse} disabled={verseLoading}>
                    {verseLoading ? "Loading…" : "Load Verse"}
                  </button>
                </div>
              </div>
              {verseError && <p style={{color:"var(--rose)",fontSize:".88rem",marginTop:10}}>{verseError}</p>}
            </div>

            {verseData && (
              <div className="verse-display">
                <div className="verse-reference">{verseData.surahName} — Ayah {verseData.ayah}</div>
                <div className="verse-hint">Tap any Arabic word to see its meaning and add it to the list</div>

                {/* Word-by-word interactive display */}
                <div className="wbw-grid">
                  {verseData.wordList.map((w, i) => {
                    const isSelected = selectedWordIdx === i;
                    const alreadyAdded = words.some(wd => wd.arabic === w.arabic);
                    return (
                      <button key={i}
                        className={`wbw-cell ${isSelected ? "selected" : ""} ${alreadyAdded ? "already-added" : ""}`}
                        onClick={() => setSelectedWordIdx(isSelected ? null : i)}>
                        <span className="wbw-arabic">{w.arabic}</span>
                        <span className="wbw-translit">{w.transliteration}</span>
                        <span className={`wbw-meaning ${isSelected ? "highlighted" : ""}`}>{w.meaning}</span>
                        {alreadyAdded && <span className="wbw-check">✓</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Full translation */}
                <div className="verse-full-translation">
                  <span className="verse-translation-label">Full verse: </span>
                  {verseData.fullTranslation}
                </div>

                {/* Confirm panel */}
                {selectedWord && (
                  <div className="word-popup">
                    <div className="word-popup-header">Add this word to the vocabulary list?</div>
                    <div className="word-popup-row">
                      <div className="word-popup-arabic">{selectedWord.arabic}</div>
                      <div className="word-popup-meaning-block">
                        <div className="word-popup-meaning">{selectedWord.meaning}</div>
                        <div className="word-popup-translit">{selectedWord.transliteration}</div>
                      </div>
                    </div>
                    <div className="field" style={{marginBottom:12}}>
                      <label>Your Name (optional)</label>
                      <input placeholder="e.g. Fatima"
                        value={wordAddedBy} onChange={e => setWordAddedBy(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveWord()} />
                    </div>
                    <div className="popup-btns">
                      <button className="submit-btn" onClick={saveWord}
                        disabled={savingWord} style={{flex:1}}>
                        {savingWord ? "Saving…" : "✓ Add to Vocab List"}
                      </button>
                      <button className="back-btn" onClick={() => setSelectedWordIdx(null)}
                        style={{padding:"10px 16px"}}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── MANUAL ADD ── */}
        {words !== null && tab === "add" && (
          <div className="add-form">
            <h2>✦ Add a Word Manually</h2>
            <form onSubmit={handleManualAdd}>
              <div className="form-row">
                <div className="field">
                  <label>Arabic Word *</label>
                  <input name="arabic" className="arabic" placeholder="كتب" required />
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
                  <input name="surah" placeholder="e.g. Al-Baqarah 2:255" />
                </div>
                <div className="field">
                  <label>&nbsp;</label>
                  <button type="submit" className="submit-btn" style={{width:"100%"}}>Add Word</button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* ── QUIZ ── */}
        {words !== null && tab === "quiz" && (
          questions.length === 0 ? (
            <div className="quiz-setup">
              <h2>✦ Vocabulary Quiz</h2>
              <p>Test yourself on the group&apos;s collected words</p>
              {words.length < 4 ? (
                <p style={{color:"var(--rose)"}}>Add at least 4 words before starting a quiz.</p>
              ) : (
                <>
                  <div style={{marginBottom:16}}>
                    <div className="quiz-section-label">Number of questions</div>
                    <div className="quiz-options">
                      {[10,20,30,"All"].map(n => (
                        <button key={n} className={`quiz-option-btn ${quizCount===(n==="All"?9999:n)?"selected":""}`}
                          onClick={() => setQuizCount(n==="All"?9999:n)}>{n}</button>
                      ))}
                    </div>
                  </div>
                  {contributors.length > 1 && (
                    <div style={{marginBottom:20}}>
                      <div className="quiz-section-label">Filter by contributor</div>
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
      <div className="score-circle"><div className="score-number">{pct}%</div></div>
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
