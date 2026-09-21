# 🧠 MEMORA - Life Memory Assistant & Study Hub

MEMORA is an intelligent full-stack second-brain and document management application designed to organize study notes, life documents, web resources, and track critical action items.

---

## 🚀 Live Demo

- *Frontend (Vercel):* [https://secondbrain-sepia-five.vercel.app](https://secondbrain-sepia-five.vercel.app)
  
- *Backend API (Render):* [https://memora-w72x.onrender.com](https://memora-w72x.onrender.com)
  
- *API Documentation (Swagger UI):* [https://memora-w72x.onrender.com/docs](https://memora-w72x.onrender.com/docs)

---

## ✨ Key Features

- *Document Management:* Upload, categorize, and track essential documents (College/Study, Personal, Finance, Health, etc.).
  
- *Action Items & Deadlines:* Automatic tracking of pending tasks, due dates, and reminders.
  
- *Study & Web Vault:* Save and organize research links, study materials, and YouTube lectures.
  
- *Browser Extension Integration:* Capture links, notes, and study resources directly from the browser.
  
- *Semantic Search:* Fast and contextual retrieval across stored resources.

---

## 🛠️ Tech Stack

### Frontend
- *Framework:* React.js (Vite)
- *Styling:* CSS3 / Modern UI
- *Hosting:* Vercel

### Backend
- *Framework:* FastAPI (Python 3)
- *Data & Processing:* RESTful APIs, Semantic Search pipeline
- *Hosting:* Render

---

## 📁 Repository Structure

MEMORA/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # API endpoints (documents, web resources)
│   │   ├── core/             # Database and core config
│   │   ├── models/           # Data models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # Semantic search and business logic
│   │   └── main.py           # FastAPI entrypoint & CORS setup
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/       # UI Components (Dashboard, ResourcesHub, Modals)
│   │   ├── App.jsx           # Main application setup
│   │   └── main.jsx
│   └── package.json
└── extension/                # Browser extension source files


💻 Local Development Setup

1. Backend Setup
# Navigate to backend
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI development server
uvicorn app.main:app --reload --port 8000

Backend will run at http://127.0.0.1:8000.
2. Frontend Setup
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev

Frontend will run at http://localhost:5173.
⚙️ Environment Variables
Frontend (frontend/.env)
VITE_API_URL=[https://memora-w72x.onrender.com](https://memora-w72x.onrender.com)

(Set to http://127.0.0.1:8000 for local development).
👥 Contributors
 * Sayan Chatterjee (@sayanc889-wq)
 * Prithvijit Bose (@PrithvijitBose)
