"""SDK error types."""


class MentioraError(Exception):
    """Base exception for all Mentiora SDK errors.

    Args:
        message: Human-readable error description.
        code: Machine-readable error code (e.g., ``'NETWORK_ERROR'``).
    """

    def __init__(self, message: str, code: str) -> None:
        """Initialize error."""
        super().__init__(message)
        self.message = message
        self.code = code
        self.name = self.__class__.__name__


class NetworkError(MentioraError):
    """Network or HTTP transport error.

    Raised when an HTTP request fails due to connectivity issues, timeouts,
    or non-successful status codes after all retries are exhausted.

    Args:
        message: Human-readable error description.
        status_code: HTTP status code, if available.
        server_code: Machine-readable error code from the server response
            (e.g. ``'agent_not_found'``, ``'invalid_request'``).
        server_message: Detailed error message from the server response.
    """

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        server_code: str | None = None,
        server_message: str | None = None,
    ) -> None:
        """Initialize network error."""
        super().__init__(message, 'NETWORK_ERROR')
        self.status_code = status_code
        self.server_code = server_code
        self.server_message = server_message


class ValidationError(MentioraError):
    """Invalid input data error.

    Raised when a trace event or other input fails validation
    (e.g., missing required fields).

    Args:
        message: Human-readable validation error description.
    """

    def __init__(self, message: str) -> None:
        """Initialize validation error."""
        super().__init__(message, 'VALIDATION_ERROR')


class ConfigurationError(MentioraError):
    """Invalid SDK configuration error.

    Raised when the SDK is initialized with invalid configuration
    (e.g., missing API key).

    Args:
        message: Human-readable configuration error description.
    """

    def __init__(self, message: str) -> None:
        """Initialize configuration error."""
        super().__init__(message, 'CONFIGURATION_ERROR')
