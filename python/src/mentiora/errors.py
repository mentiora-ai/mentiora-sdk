"""SDK error types."""


class MentioraError(Exception):
    """Base exception for all Mentiora SDK errors."""

    def __init__(self, message: str, code: str) -> None:
        """Initialize error."""
        super().__init__(message)
        self.message = message
        self.code = code
        self.name = self.__class__.__name__


class NetworkError(MentioraError):
    """Network/HTTP errors."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        """Initialize network error."""
        super().__init__(message, 'NETWORK_ERROR')
        self.status_code = status_code


class ValidationError(MentioraError):
    """Invalid input data errors."""

    def __init__(self, message: str) -> None:
        """Initialize validation error."""
        super().__init__(message, 'VALIDATION_ERROR')


class ConfigurationError(MentioraError):
    """Invalid configuration errors."""

    def __init__(self, message: str) -> None:
        """Initialize configuration error."""
        super().__init__(message, 'CONFIGURATION_ERROR')
