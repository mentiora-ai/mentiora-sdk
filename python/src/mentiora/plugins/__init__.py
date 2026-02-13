"""Plugin exports for Mentiora SDK.

Provides integrations for OpenAI, LangChain, and other frameworks.
Optional: require mentiora-sdk[langchain] and/or mentiora-sdk[openai].
"""

from .types import MentioraTracingLangChainOptions, TrackOpenAIOptions

try:
    from .langchain import MentioraTracingLangChain
except ImportError:
    MentioraTracingLangChain = None  # type: ignore[misc, assignment]

try:
    from .openai import track_openai
except ImportError:
    track_openai = None  # type: ignore[assignment]

__all__ = [
    'track_openai',
    'MentioraTracingLangChain',
    'TrackOpenAIOptions',
    'MentioraTracingLangChainOptions',
]
