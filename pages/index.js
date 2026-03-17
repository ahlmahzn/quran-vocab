import { useState, useEffect, useCallback, useRef } from "react";
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

// Speak Arabic text using the browser's built-in Web Speech API
// This requires no external CDN and works reliably everywhere
function speakArabic(text) {
  if (!text || typeof window === "undefined") return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ar-SA";
    utter.rate = 0.8;
    utter.pitch = 1;
    // Try to find an Arabic voice
    const voices = window.speechSynthesis.getVoices();
    const arabicVoice = voices.find(v => v.lang.startsWith("ar"));
    if (arabicVoice) utter.voice = arabicVoice;
    window.speechSynthesis.speak(utter);
  } catch {}
}

// Also try fetching from everyayah.com (whole ayah, not word-level)
// as a supplementary audio option
function playVerseAudio(surah, ayah) {
  const s = String(surah).padStart(3,"0");
  const a = String(ayah).padStart(3,"0");
  // Mishari Al-Afasy on everyayah.com — widely accessible
  const url = `https://everyayah.com/data/Alafasy_64kbps/${s}${a}.mp3`;
  try {
    const audio = new Audio(url);
    audio.play().catch(() => {});
  } catch {}
}


// Basic Arabic → Latin transliteration map
const AR_MAP = {
  'ا':'a','أ':'a','إ':'i','آ':'aa','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h',
  'خ':'kh','د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s',
  'ض':'d','ط':'t','ظ':'z','ع':"'",'غ':'gh','ف':'f','ق':'q','ك':'k',
  'ل':'l','م':'m','ن':'n','ه':'h','و':'w','ي':'y','ى':'a','ة':'a',
  'ئ':'y','ؤ':'w','لا':'la',
  // diacritics
  'َ':'a','ِ':'i','ُ':'u','ً':'an','ٍ':'in','ٌ':'un','ّ':'','ْ':'',
};
function arabicToTranslit(text) {
  if (!text) return "";
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // skip non-Arabic
    if (ch.charCodeAt(0) < 0x0600 || ch.charCodeAt(0) > 0x06FF) continue;
    result += AR_MAP[ch] || "";
  }
  // Clean up double vowels, tidy spacing
  return result.replace(/(.)+/g, (m,c) => ['a','i','u'].includes(c) ? c+c : c)
               .replace(/\s+/g,' ').trim();
}

// Parse "SurahName S:A" → {surah, ayah} e.g. "Al-Baqarah 2:255" → {surah:2,ayah:255}
function parseSurahRef(ref) {
  if (!ref) return null;
  const match = ref.match(/(\d+):(\d+)/);
  if (!match) return null;
  return { surah: parseInt(match[1]), ayah: parseInt(match[2]) };
}

export default function App() {
  const [tab, setTab] = useState("list");
  const [words, setWords] = useState(null);
  const [toast, setToast] = useState("");

  // persisted user name
  const [userName, setUserName] = useState(() => {
    try { return localStorage.getItem("quran-vocab-username") || ""; } catch { return ""; }
  });
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const saveName = (name) => {
    const trimmed = name.trim();
    setUserName(trimmed);
    try { localStorage.setItem("quran-vocab-username", trimmed); } catch {}
    setShowNamePrompt(false);
  };

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
  // sync wordAddedBy with userName whenever verse tab opens
  useEffect(() => { setWordAddedBy(userName); }, [userName, tab]);
  const [savingWord, setSavingWord] = useState(false);
  const [playingIdx, setPlayingIdx] = useState(null);

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
      const res = await fetch(
        `https://api.quran.com/api/v4/verses/by_key/${s}:${a}?words=true&word_fields=text_uthmani,text_indopak,audio&translations=131&transliteration=true`
      );
      const json = await res.json();
      if (!json.verse || !json.verse.words) {
        setVerseError("Verse not found. Please check the Surah and Ayah numbers.");
      } else {
        const verse = json.verse;
        const wordList = verse.words
          .filter(w => w.char_type_name === "word")
          .map((w, i) => ({
            arabic: w.text_uthmani || w.text_indopak || "",
            meaning: w.translation?.text || "",
            transliteration: w.transliteration?.text || "",
            position: i + 1,
            audioUrl: w.audio?.url ? `https://audio.qurancdn.com/${w.audio.url}` : null,
          }));
        const surahName = SURAH_NAMES[s] || `Surah ${s}`;
        setVerseData({ wordList, surahName, surah: s, ayah: a });
      }
    } catch {
      setVerseError("Could not load verse. Please check your connection and try again.");
    }
    setVerseLoading(false);
  };

  const handleWordClick = (i) => {
    if (verseData) {
      const word = verseData.wordList[i];
      setPlayingIdx(i);
      speakArabic(word.arabic);
      setTimeout(() => setPlayingIdx(null), 1500);
    }
    setSelectedWordIdx(prev => prev === i ? null : i);
  };

  const saveWord = async () => {
    if (selectedWordIdx === null || !verseData) return;
    const w = verseData.wordList[selectedWordIdx];
    if (!w.meaning) return;
    setSavingWord(true);
    const surahRef = `${verseData.surahName} ${verseData.surah}:${verseData.ayah}`;
    const { error } = await supabase.from("words").insert([{
      arabic: w.arabic, meaning: w.meaning, root: null,
      transliteration: w.transliteration || null,
      added_by: (wordAddedBy.trim() || userName || null), surah: surahRef,
    }]);
    if (!error) {
      showToast(`"${w.arabic}" added! ✓`);
      setSelectedWordIdx(null);
      await loadWords();
    } else showToast("Error saving word");
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
          <h1>Quran Vocabulary</h1>
          <div className="header-user">
            {userName
              ? <button className="user-badge" onClick={() => { setNameInput(userName); setShowNamePrompt(true); }}>👤 {userName} <span className="user-edit">✏️</span></button>
              : <button className="user-badge user-badge-empty" onClick={() => { setNameInput(""); setShowNamePrompt(true); }}>👤 Set your name</button>
            }
          </div>
        </header>

        {/* Name prompt modal */}
        {showNamePrompt && (
          <div className="modal-overlay" onClick={() => setShowNamePrompt(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3 className="modal-title">Who are you?</h3>
              <p className="modal-desc">Your name will be saved on this device and automatically tagged to every word you add.</p>
              <input
                className="modal-input"
                placeholder="Enter your name…"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && nameInput.trim() && saveName(nameInput)}
                autoFocus
              />
              <div className="modal-btns">
                <button className="submit-btn" onClick={() => saveName(nameInput)} disabled={!nameInput.trim()} style={{flex:1}}>Save Name</button>
                {userName && <button className="back-btn" onClick={() => { saveName(""); }} style={{padding:"10px 14px"}}>Clear</button>}
                <button className="back-btn" onClick={() => setShowNamePrompt(false)} style={{padding:"10px 14px"}}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <nav className="tabs">
          {[["list","📖 List"],["verse","➕ Add"],["quiz","🌙 Quiz"],["games","🎯 Practice"]].map(([id, label]) => (
            <button key={id} className={`tab ${tab===id?"active":""}`} onClick={() => { setTab(id); setQuestions([]); }}>{label}</button>
          ))}
        </nav>

        {words === null && <div className="loading">Loading shared vocabulary…</div>}

        {words !== null && tab === "list" && <WordList words={words} onDelete={handleDelete} userName={userName} />}

        {words !== null && tab === "verse" && (
          <div>
            <div className="add-form">
              <h2>✦ Add Words from a Verse</h2>
              <p style={{color:"var(--muted)",fontSize:".88rem",marginBottom:18}}>
                Enter a Surah and Ayah, then <strong style={{color:"var(--gold)"}}>tap any Arabic word</strong> to hear it pronounced and add it to the list.
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
                <div className="verse-hint">🔊 Tap any word to hear it · tap again to select and add</div>
                <div className="wbw-grid">
                  {verseData.wordList.map((w, i) => {
                    const isSelected = selectedWordIdx === i;
                    const isPlaying = playingIdx === i;
                    const alreadyAdded = words.some(wd => wd.arabic === w.arabic);
                    return (
                      <button key={i}
                        className={`wbw-cell ${isSelected?"selected":""} ${alreadyAdded?"already-added":""} ${isPlaying?"playing":""}`}
                        onClick={() => handleWordClick(i)}>
                        <span className="wbw-audio-icon">{isPlaying ? "🔊" : "　"}</span>
                        <span className="wbw-arabic">{w.arabic}</span>
                        <span className="wbw-translit">{w.transliteration}</span>
                        <span className={`wbw-meaning ${isSelected?"highlighted":""}`}>{w.meaning}</span>
                        {alreadyAdded && <span className="wbw-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
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
                    {!userName && (
                      <div className="field" style={{marginBottom:12}}>
                        <label>Your Name (optional)</label>
                        <input placeholder="e.g. Fatima" value={wordAddedBy}
                          onChange={e => setWordAddedBy(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && saveWord()} />
                      </div>
                    )}
                    {userName && (
                      <div className="modal-desc" style={{marginBottom:12}}>Adding as: <strong>{userName}</strong></div>
                    )}
                    <div className="popup-btns">
                      <button className="submit-btn" onClick={saveWord} disabled={savingWord} style={{flex:1}}>
                        {savingWord ? "Saving…" : "✓ Add to Vocab List"}
                      </button>
                      <button className="back-btn" onClick={() => setSelectedWordIdx(null)} style={{padding:"10px 16px"}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}



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

        {words !== null && tab === "games" && <Games words={words} userName={userName} />}
      </div>
      <div className={`toast ${toast?"show":""}`}>{toast}</div>
    </>
  );
}

// ── Word List ─────────────────────────────────────────────────────────────────
function WordList({ words, onDelete, userName }) {
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState("all");
  const [customDays, setCustomDays] = useState("");
  const [myWords, setMyWords] = useState(false);
  const now = new Date();

  const filtered = words.filter(w => {
    if (myWords && userName && w.added_by !== userName) return false;
    if (dayFilter !== "all") {
      const days = dayFilter === "custom" ? parseInt(customDays) : parseInt(dayFilter);
      if (!isNaN(days) && days > 0) {
        const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
        if (new Date(w.created_at) < cutoff) return false;
      }
    }
    return (
      w.arabic.includes(search) ||
      w.meaning.toLowerCase().includes(search.toLowerCase()) ||
      (w.root || "").includes(search) ||
      (w.added_by || "").toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div>
      <div className="list-header">
        <h2>✦ All Words</h2>
        <span className="count-badge">{filtered.length} / {words.length}</span>
      </div>
      <div className="filter-row">
        <span className="filter-label">Show:</span>
        {[["all","All time"],["7","7 days"],["14","14 days"],["30","30 days"],["custom","Custom"]].map(([val, label]) => (
          <button key={val} className={`filter-btn ${dayFilter===val?"active":""}`} onClick={() => setDayFilter(val)}>{label}</button>
        ))}
        {dayFilter === "custom" && (
          <div className="custom-days-input">
            <input type="number" min="1" max="365" value={customDays} onChange={e => setCustomDays(e.target.value)} placeholder="days" />
            <span className="filter-label">days</span>
          </div>
        )}
        {userName && (
          <button className={`filter-btn ${myWords?"active":""}`} onClick={() => setMyWords(m => !m)}>
            👤 My words
          </button>
        )}
      </div>
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input placeholder="Search words, meanings, contributors…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">📖</div><p>{words.length === 0 ? "No words yet. Be the first to add one!" : "No words match your filters."}</p></div>
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

// ── Games Hub ─────────────────────────────────────────────────────────────────
function Games({ words, userName }) {
  const [game, setGame] = useState(null);
  const [dayFilter, setDayFilter] = useState("all");
  const [customDays, setCustomDays] = useState("");
  const [myWords, setMyWords] = useState(false);
  const now = new Date();

  const pool = words.filter(w => {
    if (myWords && userName && w.added_by !== userName) return false;
    if (dayFilter === "all") return true;
    const days = dayFilter === "custom" ? parseInt(customDays) : parseInt(dayFilter);
    if (!isNaN(days) && days > 0) {
      const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
      return new Date(w.created_at) >= cutoff;
    }
    return true;
  });

  // Words with verse refs only (for Complete the Verse)
  const verseWords = pool.filter(w => w.surah && parseSurahRef(w.surah));

  if (game === "flashcard") return <FlashcardGame words={pool} onBack={() => setGame(null)} />;
  if (game === "match") return <MatchGame words={pool} onBack={() => setGame(null)} />;
  if (game === "speed") return <SpeedRound words={pool} onBack={() => setGame(null)} />;
  if (game === "verse") return <CompleteTheVerse words={pool} verseWords={verseWords} onBack={() => setGame(null)} />;

  return (
    <div>
      <div className="add-form" style={{marginBottom:24}}>
        <h2>✦ Word Pool</h2>
        <p style={{color:"var(--muted)",fontSize:".85rem",marginBottom:14}}>Choose which words to practise with</p>
        <div className="filter-row">
          <span className="filter-label">Words from:</span>
          {[["all","All time"],["7","7 days"],["14","14 days"],["30","30 days"],["custom","Custom"]].map(([val, label]) => (
            <button key={val} className={`filter-btn ${dayFilter===val?"active":""}`} onClick={() => setDayFilter(val)}>{label}</button>
          ))}
          {dayFilter === "custom" && (
            <div className="custom-days-input">
              <input type="number" min="1" max="365" value={customDays} onChange={e => setCustomDays(e.target.value)} placeholder="days" />
              <span className="filter-label">days</span>
            </div>
          )}
          {userName && (
            <button className={`filter-btn ${myWords?"active":""}`} onClick={() => setMyWords(m => !m)}>
              👤 My words
            </button>
          )}
        </div>
        <p style={{color:"var(--teal)",fontSize:".82rem",marginTop:10}}>{pool.length} word{pool.length!==1?"s":""} in pool · {verseWords.length} with verse references</p>
      </div>

      <h2 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:"1rem",color:"var(--gold)",marginBottom:16,letterSpacing:".06em"}}>✦ Choose a Game</h2>
      <div className="games-grid">
        <button className="game-card" onClick={() => pool.length >= 1 && setGame("flashcard")} disabled={pool.length < 1}>
          <div className="game-icon">🃏</div>
          <div className="game-title">Flashcards</div>
          <div className="game-desc">Flip cards to reveal meanings. Rate yourself as you go.</div>
          <div className="game-min">1+ words</div>
        </button>
        <button className="game-card" onClick={() => pool.length >= 4 && setGame("match")} disabled={pool.length < 4}>
          <div className="game-icon">🔗</div>
          <div className="game-title">Match Up</div>
          <div className="game-desc">Connect each Arabic word to its English meaning. Race the clock.</div>
          <div className="game-min">4+ words</div>
        </button>
        <button className="game-card" onClick={() => pool.length >= 4 && setGame("speed")} disabled={pool.length < 4}>
          <div className="game-icon">⚡</div>
          <div className="game-title">Speed Round</div>
          <div className="game-desc">Words flash by fast — pick the meaning before the timer runs out or lose a life!</div>
          <div className="game-min">4+ words</div>
        </button>
        <button className="game-card" onClick={() => verseWords.length >= 3 && setGame("verse")} disabled={verseWords.length < 3}>
          <div className="game-icon">🕌</div>
          <div className="game-title">Complete the Verse</div>
          <div className="game-desc">A word is blanked from the Arabic and English. Pick the right Arabic AND meaning — both must be correct.</div>
          <div className="game-min">3+ words with verse refs</div>
        </button>
      </div>
    </div>
  );
}

// ── Flashcard Game ────────────────────────────────────────────────────────────
function FlashcardGame({ words, onBack }) {
  const [deck] = useState(() => shuffle([...words]));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [scores, setScores] = useState({ know: 0, review: 0 });
  const [done, setDone] = useState(false);
  const [playing, setPlaying] = useState(false);
  const card = deck[index];

  const rate = (knew) => {
    setScores(s => ({ ...s, [knew?"know":"review"]: s[knew?"know":"review"] + 1 }));
    if (index + 1 >= deck.length) setDone(true);
    else { setIndex(i => i + 1); setFlipped(false); }
  };

  const handleAudio = (e) => {
    e.stopPropagation(); // don't flip card
    if (!card.surah) return;
    const ref = parseSurahRef(card.surah);
    if (!ref) return;
    // Find word position by searching vocab words with same surah
    // Use constructed URL as best effort
    const arabicWords = card.arabic;
    setPlaying(true);
    setTimeout(() => setPlaying(false), 1800);
    // Try to fetch audio URL from API
    fetch(`https://api.quran.com/api/v4/verses/by_key/${ref.surah}:${ref.ayah}?words=true&word_fields=text_uthmani,audio`)
      .then(r => r.json())
      .then(json => {
        const allWords = json.verse?.words?.filter(w => w.char_type_name === "word") || [];
        const stripDia = s => s.replace(/[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g,"");
        const match = allWords.find(w =>
          w.text_uthmani === arabicWords ||
          stripDia(w.text_uthmani||"") === stripDia(arabicWords)
        );
        if (match?.audio?.url) {
          const urls = getWordAudioUrls(ref.surah, ref.ayah, allWords.indexOf(match) + 1);
        playAudio(urls[0], urls[1]);
        }
      })
      .catch(() => {});
  };

  // Get transliteration — from saved field or generate on the fly
  const translit = card.transliteration || arabicToTranslit(card.arabic);

  if (done) return (
    <div className="results">
      <div className="score-circle"><div className="score-number">{Math.round(scores.know/deck.length*100)}%</div></div>
      <h2>Flashcards done! 🃏</h2>
      <p>Knew: {scores.know} &nbsp;·&nbsp; Need review: {scores.review}</p>
      <div className="btn-row" style={{marginTop:24}}><button className="retry-btn" onClick={onBack}>Back to Games</button></div>
    </div>
  );

  return (
    <div>
      <div className="quiz-progress">
        <div className="progress-bar"><div className="progress-fill" style={{width:`${(index/deck.length*100).toFixed(1)}%`}} /></div>
        <div className="progress-label">{index+1} / {deck.length}</div>
      </div>
      <div className={`flashcard ${flipped?"flipped":""}`} onClick={() => setFlipped(f => !f)}>
        <div className="flashcard-inner">
          <div className="flashcard-front">
            <button className={`fc-audio-btn ${playing?"fc-audio-playing":""}`} onClick={handleAudio} title="Hear pronunciation">
              {playing ? "🔊" : "🔈"}
            </button>
            <div className="fc-arabic">{card.arabic}</div>
            <div className="fc-translit">{translit}</div>
            <div className="fc-tap-hint">tap anywhere to reveal meaning</div>
          </div>
          <div className="flashcard-back">
            <div className="fc-label">Meaning</div>
            <div className="fc-meaning">{card.meaning}</div>
            {card.added_by && <div className="fc-surah">added by {card.added_by}</div>}
          </div>
        </div>
      </div>
      {flipped && (
        <div className="fc-rate-row">
          <button className="fc-btn-review" onClick={() => rate(false)}>🔄 Need review</button>
          <button className="fc-btn-know" onClick={() => rate(true)}>✓ Got it!</button>
        </div>
      )}
      <div style={{textAlign:"center",marginTop:16}}>
        <button className="back-btn" onClick={onBack}>← Back to Games</button>
      </div>
    </div>
  );
}

// ── Match Up Game ─────────────────────────────────────────────────────────────
function MatchGame({ words, onBack }) {
  const COUNT = Math.min(4, words.length);
  const initRound = () => {
    const picked = shuffle([...words]).slice(0, COUNT);
    return { arabic: shuffle(picked.map(w => w.id)), meanings: shuffle(picked.map(w => w.id)), words: picked };
  };
  const [round, setRound] = useState(initRound);
  const [selArabic, setSelArabic] = useState(null);
  const [selMeaning, setSelMeaning] = useState(null);
  const [matched, setMatched] = useState([]);
  const [matchColors, setMatchColors] = useState({});
  const [wrong, setWrong] = useState([]);
  const MATCH_COLORS = ["#2d6a4f","#1d4e89","#6b2737","#5c4a1e"];
  const [errors, setErrors] = useState(0);
  const [done, setDone] = useState(false);
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now()-startTime)/1000)), 500);
    return () => clearInterval(t);
  }, [done, startTime]);

  const wordMap = Object.fromEntries(round.words.map(w => [w.id, w]));

  const check = (aId, mId) => {
    if (aId === mId) {
      const newMatched = [...matched, aId];
      const colorIdx = newMatched.length - 1;
      setMatchColors(c => ({ ...c, [aId]: MATCH_COLORS[colorIdx % MATCH_COLORS.length] }));
      setMatched(newMatched);
      setSelArabic(null); setSelMeaning(null);
      if (newMatched.length === COUNT) setDone(true);
    } else {
      setWrong([aId, mId]);
      setErrors(e => e+1);
      setTimeout(() => { setWrong([]); setSelArabic(null); setSelMeaning(null); }, 800);
    }
  };

  const handleArabic = (id) => { if (matched.includes(id)||wrong.includes(id)) return; setSelArabic(id); if (selMeaning) check(id, selMeaning); };
  const handleMeaning = (id) => { if (matched.includes(id)||wrong.includes(id)) return; setSelMeaning(id); if (selArabic) check(selArabic, id); };

  if (done) return (
    <div className="results">
      <div className="score-circle"><div className="score-number">✓</div></div>
      <h2>Matched! 🔗</h2>
      <p>{elapsed}s &nbsp;·&nbsp; {errors} mistake{errors!==1?"s":""}</p>
      <div className="btn-row" style={{marginTop:24}}>
        <button className="retry-btn" onClick={() => { setRound(initRound()); setMatched([]); setMatchColors({}); setWrong([]); setErrors(0); setDone(false); setSelArabic(null); setSelMeaning(null); }}>Play Again</button>
        <button className="back-btn" onClick={onBack}>Back to Games</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{fontFamily:"'Cinzel Decorative',serif",fontSize:".9rem",color:"var(--gold)"}}>Match the words</h2>
        <div style={{display:"flex",gap:14,fontSize:".85rem",color:"var(--muted)"}}><span>⏱ {elapsed}s</span><span>❌ {errors}</span></div>
      </div>
      <div className="match-grid">
        <div className="match-col">
          {round.arabic.map(id => {
            const w = wordMap[id];
            const isMatched = matched.includes(id), isWrong = wrong.includes(id), isSel = selArabic===id;
            const matchColor = matchColors[id];
            return <button key={id} className={`match-btn arabic-btn ${isSel?"selected":""} ${isMatched?"matched":""} ${isWrong?"wrong":""}`} style={isMatched&&matchColor?{borderColor:matchColor,background:matchColor+"33",color:"var(--text)"}:{}} onClick={() => handleArabic(id)} disabled={isMatched}>{w.arabic}</button>;
          })}
        </div>
        <div className="match-col">
          {round.meanings.map(id => {
            const w = wordMap[id];
            const isMatched = matched.includes(id), isWrong = wrong.includes(id), isSel = selMeaning===id;
            const matchColor = matchColors[id];
            return <button key={id} className={`match-btn meaning-btn ${isSel?"selected":""} ${isMatched?"matched":""} ${isWrong?"wrong":""}`} style={isMatched&&matchColor?{borderColor:matchColor,background:matchColor+"33",color:"var(--text)"}:{}} onClick={() => handleMeaning(id)} disabled={isMatched}>{w.meaning}</button>;
          })}
        </div>
      </div>
      <div style={{textAlign:"center",marginTop:16}}><button className="back-btn" onClick={onBack}>← Back to Games</button></div>
    </div>
  );
}

// ── Speed Round ───────────────────────────────────────────────────────────────
const SPEED_TIME = 10; // seconds per word
const SPEED_LIVES = 3;
const SPEED_ROUNDS = 10;
const SPEED_OPTIONS = 3;

function SpeedRound({ words, onBack }) {
  const [deck] = useState(() => shuffle([...words]).slice(0, SPEED_ROUNDS));
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState([]);
  const [lives, setLives] = useState(SPEED_LIVES);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SPEED_TIME);
  const [status, setStatus] = useState(null); // null | "correct" | "wrong" | "timeout"
  const [done, setDone] = useState(false);
  const [selectedOpt, setSelectedOpt] = useState(null);
  const timerRef = useRef(null);

  const buildOptions = useCallback((idx) => {
    const word = deck[idx];
    const others = words.filter(w => w.id !== word.id);
    const distractors = shuffle(others).slice(0, SPEED_OPTIONS - 1).map(w => w.meaning);
    return shuffle([word.meaning, ...distractors]);
  }, [deck, words]);

  useEffect(() => {
    if (index < deck.length) setOptions(buildOptions(index));
  }, [index, buildOptions, deck.length]);

  useEffect(() => {
    if (status || done) return;
    setTimeLeft(SPEED_TIME);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          handleResult(false, "timeout");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [index, status, done]);

  const handleResult = (correct, type) => {
    clearInterval(timerRef.current);
    setStatus(type || (correct ? "correct" : "wrong"));
    if (correct) setScore(s => s+1);
    else {
      const newLives = lives - 1;
      setLives(newLives);
      if (newLives <= 0) { setTimeout(() => setDone(true), 900); return; }
    }
    setTimeout(() => {
      if (index + 1 >= deck.length) setDone(true);
      else { setIndex(i => i+1); setStatus(null); setSelectedOpt(null); }
    }, 900);
  };

  const handleAnswer = (opt) => {
    if (status) return;
    setSelectedOpt(opt);
    const correct = opt === deck[index].meaning;
    handleResult(correct, correct ? "correct" : "wrong");
  };

  const timerPct = (timeLeft / SPEED_TIME) * 100;
  const timerColor = timerPct > 50 ? "var(--teal)" : timerPct > 25 ? "var(--gold)" : "var(--rose)";

  if (done) return (
    <div className="results">
      <div className="score-circle"><div className="score-number">{score}/{deck.length}</div></div>
      <h2>{score === deck.length ? "Perfect! ماشاء الله" : score >= deck.length*0.8 ? "Excellent! ⚡" : lives <= 0 ? "Out of lives!" : "Good effort!"}</h2>
      <p>{score} correct out of {deck.length}</p>
      <div className="btn-row" style={{marginTop:24}}>
        <button className="retry-btn" onClick={onBack}>Back to Games</button>
      </div>
    </div>
  );

  const card = deck[index];
  return (
    <div>
      <div className="speed-header">
        <div className="speed-lives">{"❤️".repeat(lives)}{"🖤".repeat(SPEED_LIVES-lives)}</div>
        <div className="speed-score">Score: {score}</div>
        <div className="speed-round">{index+1}/{deck.length}</div>
      </div>
      {/* Timer bar */}
      <div className="speed-timer-bar">
        <div className="speed-timer-fill" style={{width:`${timerPct}%`, background: timerColor}} />
      </div>
      <div className="speed-countdown" style={{color: timerColor}}>{timeLeft}s</div>

      <div className={`quiz-card speed-card ${status?"speed-"+status:""}`}>
        <div className="quiz-question-label">What does this word mean?</div>
        <div className="quiz-arabic">{card.arabic}</div>
        {card.transliteration && <div className="quiz-surah" style={{color:"var(--teal)",fontStyle:"italic"}}>{card.transliteration}</div>}
        {card.surah && <div className="quiz-surah">{card.surah}</div>}
      </div>

      <div className="answer-grid" style={{marginTop:12}}>
        {options.map(opt => {
          let cls = "answer-btn";
          if (status) {
            if (opt === card.meaning) cls += " correct";
            else if (opt === selectedOpt) cls += " wrong";
          }
          return <button key={opt} className={cls} onClick={() => handleAnswer(opt)} disabled={!!status}>{opt}</button>;
        })}
      </div>

      <div style={{textAlign:"center",marginTop:16}}>
        <button className="back-btn" onClick={onBack}>← Back to Games</button>
      </div>
    </div>
  );
}

// ── Complete the Verse ────────────────────────────────────────────────────────
const CTV_ROUNDS = 5;

function CompleteTheVerse({ words, verseWords, onBack }) {
  const [rounds, setRounds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [index, setIndex] = useState(0);
  const [selArabic, setSelArabic] = useState(null);
  const [selMeaning, setSelMeaning] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const build = async () => {
      setLoading(true);
      setLoadError("");
      const picked = shuffle([...verseWords]).slice(0, CTV_ROUNDS);
      const built = [];

      for (const word of picked) {
        const ref = parseSurahRef(word.surah);
        if (!ref) continue;
        try {
          // Fetch word-by-word WITH per-word translation
          const res = await fetch(
            `https://api.quran.com/api/v4/verses/by_key/${ref.surah}:${ref.ayah}?words=true&word_fields=text_uthmani&word_translation_language=en&translations=131`
          );
          const json = await res.json();
          if (!json.verse?.words) continue;

          const allWords = json.verse.words.filter(w => w.char_type_name === "word");

          // Find target word by exact match first, then partial
          let targetIdx = allWords.findIndex(w => w.text_uthmani === word.arabic);
          if (targetIdx === -1) {
            // Try matching ignoring diacritics
            const stripDia = s => s.replace(/[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g,"");
            targetIdx = allWords.findIndex(w => stripDia(w.text_uthmani||"") === stripDia(word.arabic));
          }
          if (targetIdx === -1) continue;

          // Use the word's own per-word translation for the English blank — much more accurate
          const targetWordTranslation = allWords[targetIdx].translation?.text || word.meaning;

          // Build Arabic verse words array — blank the target
          const arabicWords = allWords.map((w, i) => ({
            text: w.text_uthmani || "",
            isBlank: i === targetIdx
          }));

          // Build English word-by-word line — use each word's translation
          // Show as: word1 | word2 | ___ | word4 ...
          const englishWords = allWords.map((w, i) => ({
            text: w.translation?.text || "",
            isBlank: i === targetIdx
          }));

          // Full verse translation as context
          const fullTranslation = json.verse.translations?.[0]?.text?.replace(/<[^>]+>/g,"") || "";

          // 2 distractors each
          const pool = shuffle(words.filter(w => w.id !== word.id));
          const arabicDistractors = pool.slice(0, 2).map(w => w.arabic);
          const meaningDistractors = pool.slice(2, 4).map(w => w.meaning);

          // Use targetWordTranslation as the correct meaning for this round
          built.push({
            word: { ...word, meaning: targetWordTranslation },
            vocabMeaning: word.meaning, // original saved meaning for display
            arabicWords,
            englishWords,
            fullTranslation,
            arabicOptions: shuffle([word.arabic, ...arabicDistractors]),
            meaningOptions: shuffle([targetWordTranslation, ...meaningDistractors]),
            surahRef: word.surah,
          });
        } catch { continue; }
      }

      if (built.length === 0) {
        setLoadError("Could not load verses. Make sure words have valid Surah references like '2:255'.");
      }
      setRounds(built);
      setLoading(false);
    };
    build();
  }, []);

  const submit = () => {
    if (!selArabic || !selMeaning) return;
    const round = rounds[index];
    const bothCorrect = selArabic === round.word.arabic && selMeaning === round.word.meaning;
    if (bothCorrect) setScore(s => s + 1);
    setSubmitted(true);
  };

  const next = () => {
    if (index + 1 >= rounds.length) setDone(true);
    else { setIndex(i => i + 1); setSelArabic(null); setSelMeaning(null); setSubmitted(false); }
  };

  if (loading) return <div className="loading">Loading verses…<br/><span style={{fontSize:".8rem",color:"var(--muted)"}}>Fetching from Quran API</span></div>;
  if (loadError) return <div className="empty"><div className="empty-icon">🕌</div><p>{loadError}</p><div style={{marginTop:20}}><button className="back-btn" onClick={onBack}>← Back</button></div></div>;
  if (!rounds || rounds.length === 0) return <div className="empty"><div className="empty-icon">🕌</div><p>Not enough words with valid verse references to play.</p><div style={{marginTop:20}}><button className="back-btn" onClick={onBack}>← Back</button></div></div>;

  if (done) return (
    <div className="results">
      <div className="score-circle"><div className="score-number">{score}/{rounds.length}</div></div>
      <h2>{score === rounds.length ? "Perfect! ماشاء الله" : score >= rounds.length*0.8 ? "Excellent! 🕌" : score >= rounds.length*0.6 ? "Good effort!" : "Keep reviewing!"}</h2>
      <p>{score} of {rounds.length} verses completed</p>
      <div className="btn-row" style={{marginTop:24}}><button className="retry-btn" onClick={onBack}>Back to Games</button></div>
    </div>
  );

  const round = rounds[index];
  const arabicCorrect = submitted && selArabic === round.word.arabic;
  const meaningCorrect = submitted && selMeaning === round.word.meaning;
  const bothCorrect = arabicCorrect && meaningCorrect;

  return (
    <div>
      <div className="quiz-progress">
        <div className="progress-bar"><div className="progress-fill" style={{width:`${(index/rounds.length*100).toFixed(1)}%`}} /></div>
        <div className="progress-label">{index+1} / {rounds.length}</div>
      </div>

      <div className="ctv-card">
        <div className="ctv-ref">{round.surahRef}</div>

        {/* Arabic verse */}
        <div className="ctv-arabic-verse">
          {round.arabicWords.map((w, i) =>
            w.isBlank
              ? <span key={i} className={`ctv-blank arabic-blank ${submitted ? (arabicCorrect?"ctv-correct":"ctv-wrong") : selArabic?"ctv-filled":""}`}>
                  {selArabic || "___"}
                </span>
              : <span key={i} className="ctv-arabic-word">{w.text}</span>
          )}
        </div>

        {/* English word-by-word with blank */}
        <div className="ctv-english-verse">
          {round.englishWords.map((w, i) =>
            w.isBlank
              ? <span key={i} className={`ctv-blank ${submitted ? (meaningCorrect?"ctv-correct":"ctv-wrong") : selMeaning?"ctv-filled":""}`}>
                  {selMeaning || "___"}
                </span>
              : <span key={i} className="ctv-eng-word">{w.text} </span>
          )}
        </div>
      </div>

      {/* Options */}
      {!submitted && (
        <div className="ctv-options-section">
          <div className="ctv-options-label">Select the missing Arabic word:</div>
          <div className="ctv-options-row arabic-options">
            {round.arabicOptions.map(opt => (
              <button key={opt} className={`ctv-option-btn arabic-opt ${selArabic===opt?"selected":""}`}
                onClick={() => setSelArabic(opt)}>{opt}</button>
            ))}
          </div>
          <div className="ctv-options-label">Select the missing English meaning:</div>
          <div className="ctv-options-row">
            {round.meaningOptions.map(opt => (
              <button key={opt} className={`ctv-option-btn ${selMeaning===opt?"selected":""}`}
                onClick={() => setSelMeaning(opt)}>{opt}</button>
            ))}
          </div>
          <button className="submit-btn" onClick={submit} disabled={!selArabic||!selMeaning} style={{width:"100%",marginTop:4}}>
            Submit ✦
          </button>
        </div>
      )}

      {/* Result */}
      {submitted && (
        <div className={`ctv-result ${bothCorrect?"ctv-result-correct":"ctv-result-wrong"}`}>
          <div className="ctv-result-icon">{bothCorrect ? "✅" : "❌"}</div>
          <div className="ctv-result-text">
            {bothCorrect
              ? "Both correct! Well done."
              : <span>The answer was: <span className="ctv-answer-arabic">{round.word.arabic}</span> — <em>{round.word.meaning}</em></span>
            }
          </div>
          <button className="submit-btn" onClick={next} style={{marginTop:12,width:"100%"}}>
            {index+1 >= rounds.length ? "See Results ✦" : "Next Verse →"}
          </button>
        </div>
      )}

      <div style={{textAlign:"center",marginTop:12}}>
        <button className="back-btn" onClick={onBack}>← Back to Games</button>
      </div>
    </div>
  );
}


// ── Quiz Question ─────────────────────────────────────────────────────────────
function QuizQuestion({ q, total, index, selected, onAnswer }) {
  const pct = ((index/total)*100).toFixed(1)+"%";
  return (
    <div>
      <div className="quiz-progress">
        <div className="progress-bar"><div className="progress-fill" style={{width:pct}} /></div>
        <div className="progress-label">{index+1} / {total}</div>
      </div>
      <div className="quiz-card">
        <div className="quiz-question-label">What does this word mean?</div>
        <div className="quiz-arabic">{q.word.arabic}</div>
        {q.word.surah && <div className="quiz-surah">{q.word.surah}</div>}
        <div className="answer-grid four-opts">
          {q.options.map(opt => {
            let cls = "answer-btn";
            if (selected) { if (opt===q.correct) cls+=" correct"; else if (opt===selected) cls+=" wrong"; }
            return <button key={opt} className={cls} onClick={() => onAnswer(opt)} disabled={!!selected}>{opt}</button>;
          })}
        </div>
      </div>
    </div>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────
function Results({ answers, onRetry, onBack }) {
  const correct = answers.filter(a => a.isCorrect).length;
  const pct = Math.round((correct/answers.length)*100);
  const grade = pct===100?"Perfect! ماشاء الله":pct>=80?"Excellent! 🌟":pct>=60?"Good effort! Keep going":"Keep reviewing!";
  return (
    <div className="results">
      <div className="score-circle"><div className="score-number">{pct}%</div></div>
      <h2>{grade}</h2>
      <p>{correct} of {answers.length} correct</p>
      <div className="result-list">
        {answers.map((a,i) => (
          <div key={i} className="result-item">
            <span>{a.isCorrect?"✅":"❌"}</span>
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
