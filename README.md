# Omni-Channel

**A unified AI backend that takes text, voice, documents, and images through one endpoint and turns them into a single, context-aware conversation.**

![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white) ![PyTorch](https://img.shields.io/badge/PyTorch-EE4C2C?style=flat&logo=pytorch&logoColor=white) ![Hugging Face](https://img.shields.io/badge/Hugging%20Face-FFD21E?style=flat&logo=huggingface&logoColor=black) ![scikit-learn](https://img.shields.io/badge/scikit--learn-F7931E?style=flat&logo=scikitlearn&logoColor=white) ![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)

## Overview

Most chat systems handle one input type well and bolt the rest on later. Omni-Channel starts from the opposite assumption: a user might type a question, send a voice note, drop in a PDF, and paste a screenshot — sometimes all in the same request — and they expect the assistant to treat it as one coherent thought.

This repo is the backend (FastAPI) plus a React client that does exactly that. A single endpoint accepts text, audio, documents, and images together as `multipart/form-data`, normalizes every modality into plain text, groups related pieces by meaning, decides whether the request is clear enough to answer (and asks a follow-up if it isn't), pulls in relevant organization and user knowledge, and generates a reply whose tone is shaped by the user's detected emotion. For voice replies, the text gets light natural-speech disfluencies before it's spoken back.

I built this during my AI Engineer role at September AI as a standalone realization of a multimodal-orchestration idea. It's a solo build, and the system is functional end to end — backend pipeline, semantic memory, and a voice-mode frontend with on-device voice activity detection.

## Key Features

- **One endpoint, four modalities.** `POST /input/omnichannel` accepts any combination of `text`, `audio`, `document`, and `image` in a single request. At least one must be present; all four can arrive at once.
- **Parallel normalization.** Each modality is normalized concurrently with `asyncio.gather`, so a request with audio + a PDF + an image doesn't process them one after another.
  - Text — validated and cleaned inline.
  - Audio — transcribed server-side with OpenAI Whisper (`base` model).
  - Documents — text extracted from PDF (pdfplumber), DOCX (python-docx), and plain `.txt`.
  - Images — OCR via PaddleOCR (English, CPU).
- **Semantic clustering of inputs and history.** Normalized pieces are embedded and grouped by cosine similarity so the model sees coherent "buckets" of related content rather than a flat list. New inputs are matched against clusters carried over from earlier in the session.
- **Active elicitation.** Before answering, an LLM-driven ambiguity check decides whether the request can actually be answered with what's known. If a pronoun, missing parameter, or vague reference genuinely blocks a useful answer, the API returns clarifying questions instead of guessing.
- **Context envelope.** A structured object is assembled per request — clusters, conversation history, cluster relationships, an estimated-complexity score, and a reasoning trace — and handed to the LLM as system context.
- **Organization + user memory.** A memory router runs semantic search over a per-organization knowledge base and a per-user memory, then injects the top matches into the prompt. After each interaction, the user memory learns from the exchange.
- **Emotion-aware responses.** A DistilRoBERTa emotion classifier reads the user's text; the result is mapped to a response-tone profile (frustrated, excited, happy, calm, and so on) that changes both the content and the instructions sent to the LLM.
- **Natural voice replies.** For clusters that include audio, the reply is post-processed with disfluencies (fillers, light corrections, emotional sounds) scaled by the detected intensity, then spoken via ElevenLabs TTS on the client.
- **Session continuity.** Inputs, responses, and clusters are kept per `session_id`, so later turns can reference earlier ones across different channels.
- **Voice-mode frontend.** A React + TypeScript client with on-device Silero VAD (ONNX, via `onnxruntime-web`) for hands-free turn detection, plus text, attachment, and audio-recorder inputs.

## How It Works

The request flow lives in `backend/api/input.py`. Here's the path a request takes.

### 1. Ingestion and normalization

The endpoint receives the raw form data and attaches metadata (channel, optional `user_id`/`session_id`, timestamp). Each present modality runs its own coroutine:

- `detect_input_type` maps the MIME type to one of `text | audio | document | image`.
- Files are written to disk under a per-request `input_id` (`storage/disk.py`).
- `normalisation/dispatcher.py` routes each one to the right normalizer. Whisper handles audio transcription, pdfplumber/python-docx handle documents, PaddleOCR handles images, and text passes through cleaning.

All four run together and the results collapse into a list of `InputItem`s, each carrying its normalized text.

### 2. Semantic clustering

`semantic/clustering.py` embeds the normalized texts with `sentence-transformers/all-MiniLM-L6-v2` and clusters them with scikit-learn's `AgglomerativeClustering` on a precomputed cosine-distance matrix (average linkage, similarity threshold 0.5). When a session already has clusters, new items are matched against each prior cluster's centroid embedding; anything that doesn't fit above the threshold forms a new bucket. Embeddings are cached in an LRU map (max 1000 entries) so repeated text isn't re-encoded.

### 3. Elicitation

`elicitation/resolver.py` takes the newest input plus the clusters and conversation history and runs an LLM-based ambiguity check. The prompt is a step-by-step framework — pronoun resolution, parameter completeness, reference resolution — with a conservative default: only flag for clarification when it's confident (≥80%) that the request can't be answered as-is. If clarification is needed, the endpoint returns early with the questions and never calls the main model.

### 4. Context construction

`context/constructor.py` builds a `ContextEnvelope`: cluster envelopes, conversation history (last N turns), cluster relationships, an estimated-complexity rating from thresholds on cluster/item count and text length, and a human-readable reasoning trace. This is the structured "what the model needs to know" object.

### 5. Sentiment and memory

The user's text is run through the emotion classifier (`j-hartmann/emotion-english-distilroberta-base`), and the label is mapped to a tone profile. In parallel, per cluster, the memory router (`memory/memory_router.py`) searches organization and user memory by cosine similarity (scope threshold 0.55) and folds the best matches into the envelope.

### 6. Response generation

`llm/groq_client.py` calls `llama-3.1-8b-instant` through the Groq API (temperature 0.2, max 150 tokens) with a system prompt that stitches together the response guidelines, the sentiment-aware tone instructions, conversation history, the current clusters, and any retrieved knowledge. Each cluster gets its own response.

### 7. Voice shaping and persistence

If a cluster contained audio, the reply runs through `tts/disfluency.py`, which injects fillers and natural corrections at an intensity that scales with detected excitement. Finally, the session store records the inputs and responses, and the user memory learns from the interaction for next time. The client speaks the reply with ElevenLabs (`eleven_flash_v2`).

## Highlights

No formal benchmarks ship with the repo, but the moving parts are concrete:

- 4 input modalities through 1 endpoint, normalized in parallel.
- Embeddings: `all-MiniLM-L6-v2`; clustering via agglomerative average-linkage at 0.5 cosine similarity.
- Generation: `llama-3.1-8b-instant` (Groq), temperature 0.2, max 150 tokens, tuned for short conversational replies.
- Emotion model: 7-class DistilRoBERTa mapped to a response-tone profile.
- Transcription: Whisper `base`; OCR: PaddleOCR; voice-activity detection: Silero VAD (ONNX) running in the browser.
- LRU embedding cache (1000 entries) and a memory scope threshold of 0.55 for retrieval.

## Tech Stack

- **Languages:** Python (backend), TypeScript (frontend).
- **Backend framework:** FastAPI + Uvicorn, Pydantic schemas, `python-multipart`.
- **LLM:** Groq (`llama-3.1-8b-instant`) via the async Groq client.
- **Data / ML:** sentence-transformers + Hugging Face Transformers, PyTorch, scikit-learn, NumPy/SciPy, OpenAI Whisper (audio), PaddleOCR / PaddlePaddle + OpenCV (image OCR), pdfplumber and python-docx (documents).
- **Frontend:** React 19 + Vite, Axios, `onnxruntime-web` with Silero VAD, ElevenLabs TTS.
- **Storage / state:** local disk for uploads, in-memory session and memory stores; org knowledge loaded from text files at startup.

## Getting Started

### Prerequisites

- Python 3.10+ and pip
- Node.js 18+ and npm
- A Groq API key (backend)
- An ElevenLabs API key and voice ID (frontend, for spoken replies)

### Installation

```bash
git clone https://github.com/DCode-v05/Omni-Channel.git
cd Omni-Channel
```

**Backend**

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
GROQ_API_KEY=your_groq_api_key
```

**Frontend**

```bash
cd ../frontend
npm install
```

Create `frontend/.env`:

```env
VITE_ELEVENLABS_API_KEY=your_elevenlabs_api_key
VITE_ELEVENLABS_VOICE_ID=your_voice_id
# optional, defaults to http://localhost:8000
VITE_API_BASE_URL=http://localhost:8000
```

### Running

```bash
# backend (from /backend)
uvicorn main:app --reload

# frontend (from /frontend)
npm run dev
```

The first backend run downloads the Whisper, embedding, and emotion models, so give it a moment to warm up. Organization knowledge is loaded from `backend/memory/knowledge_base/` on startup. A `/health` endpoint is available for liveness checks.

## Usage

Send a `multipart/form-data` request to `POST /input/omnichannel`. Provide at least one of `text`, `audio`, `document`, `image`, plus a required `channel`; `user_id` and `session_id` are optional but enable memory and continuity.

```bash
curl -X POST http://localhost:8000/input/omnichannel \
  -F "channel=web" \
  -F "session_id=11111111-1111-1111-1111-111111111111" \
  -F "text=Summarize this and tell me what to do next" \
  -F "document=@./report.pdf" \
  -F "image=@./screenshot.png"
```

The response includes the resolved clusters, one `llm_response` per cluster, the detected sentiment, the full context envelope, and a cluster count. If the elicitation step decides the request is ambiguous, you instead get `needs_clarification: true` and a list of `questions` to ask back. Reuse the same `session_id` across calls so the system can connect a document uploaded earlier to a voice question asked later.

The frontend wraps all of this in a chat UI with a dedicated voice mode: Silero VAD detects when you start and stop speaking, the recording is sent to the same endpoint, and the reply is read back through ElevenLabs.

## Project Structure

```
Omni-Channel/
├── backend/
│   ├── main.py                    # FastAPI app, CORS, startup memory load, /health
│   ├── api/
│   │   ├── input.py               # the omnichannel pipeline (orchestrates everything)
│   │   └── admin.py               # admin endpoints
│   ├── normalisation/             # per-modality text extraction
│   │   ├── dispatcher.py          # routes input_type -> normalizer
│   │   ├── text.py / audio.py     # cleaning / Whisper transcription
│   │   ├── document.py / image.py # pdfplumber + docx / PaddleOCR
│   ├── semantic/
│   │   ├── embeddings.py          # all-MiniLM-L6-v2 + LRU cache + cosine sim
│   │   └── clustering.py          # agglomerative clustering, session-aware
│   ├── elicitation/resolver.py    # LLM ambiguity check + clarifying questions
│   ├── context/                   # context envelope builder + data models
│   ├── sentiment/analyzer.py      # DistilRoBERTa emotion classifier
│   ├── memory/                    # org + user memory, router, knowledge_base/
│   ├── llm/groq_client.py         # Groq call + system-prompt assembly
│   ├── tts/disfluency.py          # natural-speech post-processing for audio replies
│   ├── history/memory_store.py    # in-memory session + cluster store
│   ├── metadata/ resolvers/ schemas/ storage/ validators/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx                # main app
│   │   ├── components/            # OmniInput, VoiceMode, ChatArea, AudioRecorder, ...
│   │   ├── modules/
│   │   │   ├── audio/             # capture + playback plumbing
│   │   │   └── vad/               # Silero VAD wrapper (ONNX)
│   │   ├── services/              # api.ts, audioPlayer.ts, ttsEnhancer.ts
│   │   └── styles/ types/
│   ├── public/models/            # silero_vad.onnx
│   └── package.json / vite.config.ts / tsconfig.json
└── README.md
```

---

## Contact

<table>
  <tr><td><b>Portfolio:</b> <a href="https://www.denistan.me">Denistan</a></td><td><b>LinkedIn:</b> <a href="https://www.linkedin.com/in/denistanb">denistanb</a></td></tr>
  <tr><td><b>GitHub:</b> <a href="https://github.com/DCode-v05">DCode-v05</a></td><td><b>LeetCode:</b> <a href="https://leetcode.com/u/Denistan_B">Denistan_B</a></td></tr>
  <tr><td colspan="2" align="center"><b>Email:</b> <a href="mailto:denistanb05@gmail.com">denistanb05@gmail.com</a></td></tr>
</table>

Made with ❤️ by **Denistan B**
