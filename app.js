
function getApiKey() {
  let key = localStorage.getItem("gemini_key");
  if (!key) {
    key = prompt("Paste your Gemini API key:");
    if (key) localStorage.setItem("gemini_key", key);
  }
  return key;
}
const GEMINI_API_KEY = getApiKey();
// ── TOPICS ──────────────────────────────────────────────
const topics = [
  "Social media is making us lonelier",
  "Why failure is better than success",
  "The best invention of the last 100 years",
  "Should everyone learn to code?",
  "Books vs. movies — which tells better stories?",
  "Why sleep is the most underrated skill",
  "The problem with perfectionism",
  "Would you live on Mars?",
  "Is fast food a cultural achievement?",
  "What makes a good friend?",
  "Should schools teach financial literacy?",
  "The last thing that genuinely surprised you",
  "Why boredom is actually good for you",
  "Online learning vs. classroom learning",
  "The most important life skill nobody teaches",
  "Should AI have rights?",
  "Why do we procrastinate?",
  "What would you do with one free year?",
  "Is ambition overrated?",
  "The thing you wish you knew at 15",
];

// ── STATE ────────────────────────────────────────────────
let timerInterval = null;
let secondsLeft = 60;
let isRecording = false;
let transcript = "";
let recognition = null;

// ── DOM REFS ─────────────────────────────────────────────
const topicText     = document.getElementById("topicText");
const timerDisplay  = document.getElementById("timerDisplay");
const timerBar      = document.getElementById("timerBar");
const topicBtn      = document.getElementById("topicBtn");
const recordBtn     = document.getElementById("recordBtn");
const statusMsg     = document.getElementById("statusMsg");
const transcriptSection = document.getElementById("transcriptSection");
const transcriptBox = document.getElementById("transcriptBox");
const feedbackSection   = document.getElementById("feedbackSection");
const feedbackBox   = document.getElementById("feedbackBox");
const scoreClarity  = document.getElementById("scoreClarity");
const scoreStructure= document.getElementById("scoreStructure");
const scoreConfidence=document.getElementById("scoreConfidence");
const scoreFillers  = document.getElementById("scoreFillers");
const streakCount   = document.getElementById("streakCount");

// ── STREAK ───────────────────────────────────────────────
function loadStreak() {
  const data = JSON.parse(localStorage.getItem("speakup_streak") || '{"count":0,"lastDate":""}');
  const today = new Date().toDateString();
  if (data.lastDate === today) {
    streakCount.textContent = data.count;
  } else {
    // Check if yesterday — if so, streak continues; otherwise reset
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (data.lastDate !== yesterday) {
      data.count = 0;
    }
    streakCount.textContent = data.count;
  }
  return data;
}

function saveStreak() {
  const today = new Date().toDateString();
  const data = JSON.parse(localStorage.getItem("speakup_streak") || '{"count":0,"lastDate":""}');
  if (data.lastDate !== today) {
    data.count += 1;
    data.lastDate = today;
    localStorage.setItem("speakup_streak", JSON.stringify(data));
    streakCount.textContent = data.count;
  }
}

loadStreak();

// ── TOPIC ─────────────────────────────────────────────────
topicBtn.addEventListener("click", () => {
  const random = topics[Math.floor(Math.random() * topics.length)];
  topicText.textContent = random;
  topicText.classList.remove("empty");
  recordBtn.disabled = false;
  setStatus("Topic ready. Hit Start when you are.");
  resetTimer();
  hideFeedback();
});

// ── TIMER ─────────────────────────────────────────────────
function resetTimer() {
  clearInterval(timerInterval);
  secondsLeft = 60;
  updateTimerDisplay();
  timerBar.style.width = "100%";
  timerBar.classList.add("safe");
  timerDisplay.classList.remove("urgent");
}

function updateTimerDisplay() {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  timerDisplay.textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

function startTimer() {
  timerInterval = setInterval(() => {
    secondsLeft--;
    updateTimerDisplay();
    const pct = (secondsLeft / 60) * 100;
    timerBar.style.width = pct + "%";

    if (secondsLeft <= 15) {
      timerBar.classList.remove("safe");
      timerDisplay.classList.add("urgent");
    }

    if (secondsLeft <= 0) {
      stopRecording();
    }
  }, 1000);
}

// ── WEB SPEECH API ────────────────────────────────────────
function startRecording() {
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    setStatus("Your browser doesn't support speech recognition. Try Chrome.");
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  transcript = "";
  let interimTranscript = "";

  recognition.onresult = (event) => {
    let final = "";
    interimTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript + " ";
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    transcript += final;
    // Show live transcript
    transcriptBox.textContent = transcript + interimTranscript;
  };

  recognition.onerror = (e) => {
    setStatus("Mic error: " + e.error + ". Check your microphone permissions.");
  };

  recognition.start();
  isRecording = true;
  recordBtn.textContent = "Stop";
  recordBtn.classList.add("recording");
  transcriptSection.classList.add("visible");
  transcriptBox.textContent = "";
  setStatus("Listening… speak clearly.");
  startTimer();
}

function stopRecording() {
  clearInterval(timerInterval);
  if (recognition) recognition.stop();
  isRecording = false;
  recordBtn.textContent = "Start speaking";
  recordBtn.classList.remove("recording");
  setStatus("Done! Getting your feedback…");
  saveStreak();

  setTimeout(() => {
    if (transcript.trim().length > 10) {
      getGeminiFeedback(transcript.trim());
    } else {
      setStatus("Couldn't catch much — try speaking louder or check mic permissions.");
    }
  }, 800);
}

recordBtn.addEventListener("click", () => {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
});

// ── GEMINI GRADING ────────────────────────────────────────
async function getGeminiFeedback(spokenText) {
  const topic = topicText.textContent;

  feedbackSection.classList.add("visible");
  feedbackBox.innerHTML = '<div class="loading-text">Analysing your speech…</div>';
  scoreClarity.textContent = "—";
  scoreStructure.textContent = "—";
  scoreConfidence.textContent = "—";
  scoreFillers.textContent = "—";

  const prompt = `You are a public speaking coach. A student was given this topic: "${topic}"
They spoke for up to 1 minute. Here is what they said (transcribed):

"${spokenText}"

Grade their speech on these 4 dimensions, each out of 10:
1. Clarity — how clear and understandable were their words?
2. Structure — did they have an opening, middle, and point?
3. Confidence — did they sound certain and fluent?
4. Fillers — how few filler words (um, uh, like, you know) did they use? (10 = no fillers, 1 = constant fillers)

Then give 3-4 sentences of honest, specific, encouraging coaching feedback.

Reply ONLY in this exact JSON format, nothing else:
{
  "clarity": 7,
  "structure": 6,
  "confidence": 8,
  "fillers": 5,
  "feedback": "Your feedback here."
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await response.json();
    const raw = data.candidates[0].content.parts[0].text;

    // Strip any markdown code fences if Gemini adds them
    const clean = raw.replace(/```json|```/g, "").trim();
    const result = JSON.parse(clean);

    scoreClarity.textContent   = result.clarity + "/10";
    scoreStructure.textContent = result.structure + "/10";
    scoreConfidence.textContent= result.confidence + "/10";
    scoreFillers.textContent   = result.fillers + "/10";
    feedbackBox.textContent    = result.feedback;
    setStatus("All done! Try another topic.");

  } catch (err) {
    feedbackBox.textContent = "Couldn't get feedback right now. Check your API key in app.js.";
    setStatus("Something went wrong.");
    console.error(err);
  }
}

// ── HELPERS ───────────────────────────────────────────────
function setStatus(msg) {
  statusMsg.textContent = msg;
}

function hideFeedback() {
  transcriptSection.classList.remove("visible");
  feedbackSection.classList.remove("visible");
  transcriptBox.textContent = "";
  feedbackBox.textContent = "";
}
