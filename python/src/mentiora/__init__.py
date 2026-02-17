"""mentiora-sdk

Official SDK for the Mentiora platform.
Provides AI observability and tracing.
"""

from importlib.metadata import version as _get_version

from .agents import (
    AgentErrorEvent,
    AgentResolvedEvent,
    AgentRunParams,
    AgentRunResult,
    AgentsClient,
    AgentStreamEvent,
    AgentToolCall,
    ChatCompletedEvent,
    ModelParams,
    OutputTextDeltaEvent,
    ToolCallDeltaEvent,
    ToolCallResultEvent,
)
from .client import MentioraClient
from .errors import (
    ConfigurationError,
    MentioraError,
    NetworkError,
    ValidationError,
)
from .plugins.types import (
    MentioraTracingLangChainOptions,
    TrackOpenAIOptions,
)
from .types import (
    MentioraConfig,
    SendTraceResult,
    TraceError,
    TraceEvent,
    TraceType,
    UsageInfo,
)

try:
    __version__ = _get_version('mentiora-sdk')
except Exception:
    __version__ = '0.0.0'

# Optional plugins (require mentiora-sdk[openai] and/or mentiora-sdk[langchain])
try:
    from .plugins import MentioraTracingLangChain, track_openai
except ImportError:
    MentioraTracingLangChain = None  # type: ignore[misc, assignment]
    track_openai = None  # type: ignore[assignment]

__all__ = [
    '__version__',
    'AgentErrorEvent',
    'AgentResolvedEvent',
    'AgentRunParams',
    'AgentRunResult',
    'AgentsClient',
    'AgentStreamEvent',
    'AgentToolCall',
    'ChatCompletedEvent',
    'ModelParams',
    'OutputTextDeltaEvent',
    'ToolCallDeltaEvent',
    'ToolCallResultEvent',
    'MentioraClient',
    'MentioraError',
    'NetworkError',
    'ValidationError',
    'ConfigurationError',
    'MentioraConfig',
    'SendTraceResult',
    'TraceError',
    'TraceEvent',
    'TraceType',
    'UsageInfo',
    'track_openai',
    'MentioraTracingLangChain',
    'TrackOpenAIOptions',
    'MentioraTracingLangChainOptions',
]
