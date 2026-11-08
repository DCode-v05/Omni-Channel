# Omni-Channel

A FastAPI backend, plus a React client, that takes text, voice, documents and images in one request and handles them as a single conversation turn.

I built it at September AI as a standalone version of a multimodal-orchestration idea. The pipeline, semantic memory and the voice-mode frontend all run end to end.

## What it does

`POST /input/omnichannel` accepts any mix of `text`, `audio`, `document` and `image` as `multipart/form-data`, with at least one present. Each one is turned into plain text, related pieces are grouped by meaning, and the system either asks a clarifying question or answers with a tone matched to the user's emotion. Voice replies get light speech disfluencies before the client speaks them.

## Pipeline

The flow is in `backend/api/input.py`.

1. **Normalise.** `detect_input_type` maps the MIME type to a modality, files are saved under a per-request `input_id` (`storage/disk.py`), and `normalisation/dispatcher.py` runs each modality concurrently with `asyncio.gather`: text is cleaned, audio goes through Whisper (`base` model), documents through pdfplumber (PDF), python-docx (DOCX) or plain `.txt`, and images through PaddleOCR (English, CPU).
2. **Cluster.** `semantic/clustering.py` embeds the texts with `all-MiniLM-L6-v2` and clusters them with scikit-learn `AgglomerativeClustering` on cosine distance (average linkage, threshold 0.5). Within a session, new items are matched to earlier clusters by centroid, and anything below the threshold starts a new cluster. Embeddings are cached in an LRU map of 1000 entries.
3. **Elicit.** `elicitation/resolver.py` asks the LLM whether the newest input can be answered as is, checking pronouns, missing parameters and vague references. It only asks for clarification when confidence is at least 0.8. In that case the endpoint returns `needs_clarification: true` with `questions` and skips the main model.
4. **Build context.** `context/constructor.py` assembles a `ContextEnvelope` with the clusters, recent conversation history, cluster relationships, a complexity estimate and a short reasoning trace.
5. **Emotion and memory.** The user's text goes through `j-hartmann/emotion-english-distilroberta-base`, and the label maps to a tone profile. For each cluster, `memory/memory_router.py` searches the organisation knowledge base and the user's memory by cosine similarity (threshold 0.55).
6. **Respond.** `llm/groq_client.py` calls `llama-3.1-8b-instant` on Groq (temperature 0.2, max 150 tokens) with a system prompt built from the guidelines, tone instructions, history, clusters and retrieved knowledge. Each cluster gets its own reply.
7. **Voice and persistence.** If a cluster included audio, `tts/disfluency.py` adds fillers and corrections, scaled by emotional intensity. The session store keeps inputs, responses and clusters per `session_id`, and user memory learns from the exchange. The client speaks the reply with ElevenLabs (`eleven_flash_v2`).

The frontend has text, attachment and recorder inputs, and a voice mode that uses Silero VAD (ONNX, via `onnxruntime-web`) in the browser to detect when you start and stop talking.

Other endpoints are `GET /health` and `POST /admin/reload-memory`. Organisation knowledge is loaded from `backend/memory/knowledge_base/` at startup.

## Stack

Python, FastAPI, Uvicorn, Pydantic, Groq, sentence-transformers, Transformers, PyTorch, scikit-learn, Whisper, PaddleOCR, pdfplumber, python-docx. Frontend in React 19, TypeScript and Vite with Axios, `onnxruntime-web` and ElevenLabs. Uploads go to local disk, and sessions and memory are in-memory.

## Setup

Needs Python 3.10+, Node 18+, a Groq API key, and an ElevenLabs key and voice ID for spoken replies.

```bash
git clone https://github.com/DCode-v05/Omni-Channel.git
cd Omni-Channel/backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
GROQ_API_KEY=your_groq_api_key
```

Create `frontend/.env`:

```env
VITE_ELEVENLABS_API_KEY=your_elevenlabs_api_key
VITE_ELEVENLABS_VOICE_ID=your_voice_id
# optional, defaults to http://localhost:8000
VITE_API_BASE_URL=http://localhost:8000
```

Run each in its own terminal:

```bash
cd backend && uvicorn main:app --reload
cd frontend && npm install && npm run dev
```

The first backend run downloads the Whisper, embedding and emotion models, so it starts slowly.

## Example request

`channel` is required. `user_id` and `session_id` are optional, but they turn on memory and let later turns refer to earlier ones.

```bash
curl -X POST http://localhost:8000/input/omnichannel \
  -F "channel=web" \
  -F "session_id=11111111-1111-1111-1111-111111111111" \
  -F "text=Summarize this and tell me what to do next" \
  -F "document=@./report.pdf" \
  -F "image=@./screenshot.png"
```

The response has the clusters, one `llm_response` per cluster, the detected sentiment, the context envelope and a cluster count.

## Project structure

```
backend/
  main.py               app, CORS, startup memory load, /health
  api/                  input.py (the pipeline), admin.py
  normalisation/        dispatcher plus text, audio, document, image
  semantic/             embeddings and clustering
  elicitation/          ambiguity check and clarifying questions
  context/              context envelope
  sentiment/            emotion classifier
  memory/               organisation and user memory, router, knowledge_base/
  llm/                  Groq client and prompt assembly
  tts/                  disfluency post-processing
  history/              in-memory session and cluster store
  metadata/ resolvers/ schemas/ storage/ validators/
frontend/
  src/components/       OmniInput, VoiceMode, ChatArea, AudioRecorder, ...
  src/modules/          audio and vad (Silero)
  src/services/         api, audioPlayer, ttsEnhancer
  public/models/        silero_vad.onnx
```

## Limitations

No benchmarks ship with the repo. Sessions and memory live in process memory, so they are lost on restart.

## Contact

Denistan B: [portfolio](https://www.denistan.me), [LinkedIn](https://www.linkedin.com/in/denistanb), denistanb05@gmail.com
