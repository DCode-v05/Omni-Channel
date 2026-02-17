# Omni-Channel: Unified AI Interaction System

## Project Description

Omni-Channel is a robust, modular AI backend designed to serve as a unified processing layer for multi-modal user interactions. It synthesizes **Text**, **Audio**, and **Document** inputs into a single, standardized stream of intelligence. By normalizing disparate data sources and leveraging advanced context management, it enables applications to maintain a coherent state and understanding across different mediums of communication.

The system acts as a central hub that receives raw inputs, enriches them with metadata and sentiment analysis, and orchestrates intelligent responses via LLMs.

---

## Project Details

### Core Objectives

The primary goal of Omni-Channel is to eliminate the friction between different methods of user interaction.

- **Unified Normalization**: Whether a user types a message, speaks a voice note, or uploads a PDF, the system converts it into a standardized format for processing.
- **Intelligent Routing**: Determines the nature of the request (information seeking, action, etc.) and routes it through the appropriate logic pipelines.
- **State Continuity**: Maintains conversation history and context independent of the channel used (e.g., referencing a document uploaded yesterday while talking via audio today).

### Key Features

1.  **Multi-Modal Ingestion Pipeline**:
    - **Text**: Instant processing and validation.
    - **Audio**: Server-side transcription using **OpenAI Whisper** and input type detection.
    - **Documents**: Intelligent extraction and parsing of PDF and Word files.
2.  **Semantic Context Engine**:
    - **Clustering**: Uses embeddings to group related inputs, ensuring the LLM has access to the _exact_ relevant history, not just the most recent messages.
    - **Context Envelope**: Constructs a comprehensive data object containing all necessary session, user, and historical metadata for the LLM.
3.  **Active Elicitation Protocol**:
    - The system is designed to be proactive. If input is ambiguous or incomplete, the **Elicitation Resolver** triggers a loop to ask clarifying questions, ensuring high-quality responses.

4.  **Sentiment & Tone Analysis**:
    - Real-time analysis of user emotion (e.g., frustration, excitement).
    - Dynamically adjusts the output style. For audio responses, it can inject disfluencies to mimic natural speech patterns based on the user's current engagement level.

---

## Tech Stack

### Backend

- **Framework**: FastAPI (Python)
- **LLM Integration**: Groq API
- **Audio Processing**: OpenAI Whisper, PyTorch
- **Vector Search**: Sentence Transformers (HuggingFace) with Clustering logic
- **File Handling**: pdfplumber (PDF), python-docx (DOCX)
- **Architecture**: Modular Service-based (Normalisation, Elicitation, Semantic, Storage)

### Frontend

- **Framework**: React (Vite)
- **Language**: TypeScript
- **Runtime**: Node.js

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/september-platforms/omnichannel-input.git
cd omnichannel-input
```

### 2. Backend Setup

Navigate to the backend directory and install Python dependencies.

```bash
cd backend
# Create a virtual environment (optional but recommended)
python -m venv venv
# Activate it (Windows)
venv\Scripts\activate
# Install requirements
pip install -r requirements.txt
```

**Environment Variables**:
Create a `.env` file in `backend/` and add your API key (`GROQ_API_KEY`).

### 3. Frontend Setup

Navigate to the frontend directory and install Node modules.

```bash
cd ../frontend
npm install
```

**Environment Variables**:
Create a `.env` file in `frontend/` and add your ElevenLabs configuration:

```env
VITE_ELEVENLABS_API_KEY=your_elevenlabs_api_key
VITE_ELEVENLABS_VOICE_ID=your_voice_id
```

### 4. Run the Application

**Backend**:

```bash
# From /backend
uvicorn main:app --reload
```

**Frontend**:

```bash
# From /frontend
npm run dev
```

---

## Usage

- **API Integration**: The backend exposes the `/input/omnichannel` endpoint. This single endpoint handles `multipart/form-data` requests containing text, audio files, and document blobs.
- **Session Management**: Use the `session_id` parameter to persist context across different calls.
- **Response handling**: The API returns not just the LLM text, but also sentiment data, potential follow-up questions (if elicitation was triggered), and debug clustering info.

---

## Project Structure

```
Omni-Channel/
│
├── backend/                # FastAPI Backend Core
│   ├── api/                # API Endpoints
│   │   ├── input.py        # Main omnichannel input endpoint
│   │   └── admin.py        # Admin endpoints
│   ├── context/            # Context Management
│   │   ├── constructor.py  # Context envelope builder
│   │   └── envelope.py     # Context data models
│   ├── elicitation/        # Ambiguity Resolution
│   │   └── resolver.py     # Clarification logic
│   ├── history/            # Session Management
│   │   └── memory_store.py # In-memory session storage
│   ├── llm/                # LLM Integration
│   │   └── groq_client.py  # Groq API client
│   ├── memory/             # Knowledge Management
│   │   ├── organization_memory.py  # Company knowledge base
│   │   ├── user_memory.py          # User personalization
│   │   ├── memory_router.py        # Memory query routing
│   │   └── knowledge_base/         # Organization data files
│   ├── metadata/           # Metadata Enrichment
│   │   └── enrich.py       # Metadata processing
│   ├── normalisation/      # Input Processing
│   │   ├── dispatcher.py   # Input type routing
│   │   ├── text.py         # Text normalization
│   │   ├── audio.py        # Whisper transcription
│   │   ├── document.py     # PDF/DOCX extraction
│   │   └── image.py        # OCR processing
│   ├── resolvers/          # Type Detection
│   │   └── input_type.py   # Input type resolver
│   ├── schemas/            # Data Models
│   │   └── models.py       # Pydantic schemas
│   ├── semantic/           # Semantic Processing
│   │   ├── embeddings.py   # Embedding generation
│   │   └── clustering.py   # Semantic clustering logic
│   ├── sentiment/          # Emotion Analysis
│   │   └── analyzer.py     # Sentiment detection
│   ├── storage/            # File Management
│   │   └── disk.py         # File persistence
│   ├── tts/                # Speech Enhancement
│   │   └── disfluency.py   # Natural speech patterns
│   ├── validators/         # Input Validation
│   │   └── payload.py      # Payload validators
│   ├── main.py             # FastAPI application entry
│   └── requirements.txt    # Python dependencies
│
├── frontend/               # React TypeScript Client
│   ├── src/
│   │   ├── components/     # UI Components
│   │   │   ├── OmniInput.tsx       # Unified input component
│   │   │   ├── VoiceMode.tsx       # Voice conversation mode
│   │   │   ├── ChatArea.tsx        # Chat display
│   │   │   ├── ChatMessage.tsx     # Message component
│   │   │   ├── AudioRecorder.tsx   # Audio recording
│   │   │   ├── AttachmentButton.tsx # File upload
│   │   │   ├── TextInput.tsx       # Text input
│   │   │   └── Icons.tsx           # Icon components
│   │   ├── modules/        # Core Modules
│   │   │   ├── audio/      # Audio processing
│   │   │   └── vad/        # Voice Activity Detection (Silero VAD)
│   │   ├── services/       # API Services
│   │   │   ├── api.ts              # Backend API client
│   │   │   ├── audioPlayer.ts      # Audio playback
│   │   │   └── ttsEnhancer.ts      # ElevenLabs TTS
│   │   ├── styles/         # CSS Styles
│   │   ├── types/          # TypeScript types
│   │   ├── App.tsx         # Main application
│   │   └── main.tsx        # Entry point
│   ├── public/
│   │   └── models/         # ONNX models (Silero VAD)
│   ├── package.json        # Node dependencies
│   ├── tsconfig.json       # TypeScript config
│   └── vite.config.ts      # Vite configuration
│
└── README.md               # Project documentation
```

---

## Contributing

Contributions are welcome! To contribute to the Omni-Channel project:

1. **Fork the repository**
   ```bash
   git clone https://github.com/DCode-v05/Omni-Channel.git
   cd Omni-Channel
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow the existing code style and structure
   - Add tests if applicable
   - Update documentation as needed

4. **Commit your changes**
   ```bash
   git commit -m "Add: description of your feature"
   ```

5. **Push to your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**
   - Provide a clear description of your changes
   - Reference any related issues
   - Ensure all tests pass

### Development Guidelines
- **Backend**: Follow PEP 8 style guide for Python code
- **Frontend**: Use TypeScript strict mode and follow React best practices
- **Commits**: Use conventional commit messages (feat, fix, docs, etc.)
- **Testing**: Add unit tests for new features

---

## Contact

- **GitHub:** [DCode-v05](https://github.com/DCode-v05)
- **Email:** denistanb05@gmail.com

---