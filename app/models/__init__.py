from app.models.base import Base
<<<<<<< HEAD
from app.models.user import User
from app.models.memory import Memory
from app.models.document import Document
from app.models.life_event import LifeEvent, DocumentRelation
from app.models.youtube_link import YoutubeLink

__all__ = ["Base", "User", "Memory", "Document", "LifeEvent", "DocumentRelation", "YoutubeLink"]
=======
from app.models.memory import Memory
from app.models.document import Document
from app.models.life_event import LifeEvent, DocumentRelation
from app.models.web_resource import WebResource

__all__ = ["Base", "Memory", "Document", "LifeEvent", "DocumentRelation", "WebResource"]
>>>>>>> 2335c0f8512805af2f32ab67c525102b3d4979d6
