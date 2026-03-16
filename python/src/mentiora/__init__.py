"""mentiora-ai-sdk

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
from .files import (
    DeleteFileResult,
    FileMetadata,
    FilesClient,
    ListFilesResult,
    UploadFileParams,
    UploadFileResult,
)
from .knowledge import (
    AddDocumentsParams,
    AddDocumentsResult,
    CreateKnowledgeParams,
    CreateKnowledgeResult,
    DeleteResult,
    DocumentDetails,
    DocumentSummary,
    KnowledgeClient,
    KnowledgeDetails,
    KnowledgeSummary,
    ListDocumentsResult,
    ListKnowledgeResult,
    UpdateKnowledgeParams,
)
from .plugins.types import (
    MentioraTracingLangChainOptions,
    TrackOpenAIOptions,
)
from .streaming import SSE_HEADERS, format_sse_event, stream_events
from .types import (
    MentioraConfig,
    SendTraceResult,
    TraceError,
    TraceEvent,
    TraceType,
    UsageInfo,
)

try:
    __version__ = _get_version('mentiora-ai-sdk')
except Exception:
    __version__ = '0.0.0'

# Optional plugins (require mentiora-ai-sdk[openai] and/or mentiora-ai-sdk[langchain])
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
    'FilesClient',
    'DeleteFileResult',
    'FileMetadata',
    'ListFilesResult',
    'UploadFileParams',
    'UploadFileResult',
    'KnowledgeClient',
    'AddDocumentsParams',
    'AddDocumentsResult',
    'CreateKnowledgeParams',
    'CreateKnowledgeResult',
    'DeleteResult',
    'DocumentDetails',
    'DocumentSummary',
    'KnowledgeDetails',
    'KnowledgeSummary',
    'ListDocumentsResult',
    'ListKnowledgeResult',
    'UpdateKnowledgeParams',
    'SSE_HEADERS',
    'format_sse_event',
    'stream_events',
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
