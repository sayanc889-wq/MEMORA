from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.assistant import router as assistant_router
from app.api.routes.auth import router as auth_router
from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.life_events import router as life_events_router
from app.api.routes.memories import router as memories_router
<<<<<<< HEAD
from app.api.routes.youtube_links import router as youtube_links_router
=======
from app.api.routes.web_resources import router as web_resources_router
>>>>>>> 2335c0f8512805af2f32ab67c525102b3d4979d6
from app.core.config import settings
from app.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


# Ensure tables are created immediately
init_db()

app = FastAPI(title=settings.app_name, lifespan=lifespan)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]
if settings.frontend_url and settings.frontend_url not in origins:
    origins.append(settings.frontend_url)

app.add_middleware(
    CORSMiddleware,
<<<<<<< HEAD
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
=======
    allow_origins=["*"],
>>>>>>> 2335c0f8512805af2f32ab67c525102b3d4979d6
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(assistant_router)
app.include_router(life_events_router)
<<<<<<< HEAD
app.include_router(memories_router)
app.include_router(youtube_links_router)
=======
app.include_router(web_resources_router)
>>>>>>> 2335c0f8512805af2f32ab67c525102b3d4979d6
