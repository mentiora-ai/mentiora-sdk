import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Markdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');

  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollBottom = useCallback(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollBottom();
  }, [messages, streamingContent, scrollBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleNewChat = () => {
    setMessages([]);
    setThreadId(null);
    setStreamingContent('');
    inputRef.current?.focus();
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !busy) handleSend();
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy) return;

    setBusy(true);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      if (streaming) {
        await runStream(text);
      } else {
        await runNonStream(text);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${msg}` },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const runNonStream = async (text: string) => {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, threadId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: data.output },
    ]);
    setThreadId(data.threadId);
  };

  const runStream = async (text: string) => {
    const res = await fetch('/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, threadId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    setStreamingContent('');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          const event = JSON.parse(raw);

          if (event.type === 'delta') {
            accumulated += event.delta;
            flushSync(() => setStreamingContent(accumulated));
          } else if (event.type === 'done') {
            setThreadId(event.threadId);
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
      }
    } finally {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: accumulated },
      ]);
      setStreamingContent('');
    }
  };

  const hasMessages = messages.length > 0 || streamingContent;

  return (
    <div className="flex h-dvh flex-col bg-white text-gray-900 antialiased">
      {/* Header */}
      <header className="flex-none border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-gray-900">
                Mentiora Chatbot
              </h1>
              {threadId && (
                <p className="font-mono text-[10px] text-gray-400">
                  {threadId.slice(0, 8)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewChat}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-1 inline-block"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New chat
            </button>
            <div className="mx-1 h-4 w-px bg-gray-200" />
            <button
              onClick={() => setStreaming((s) => !s)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                streaming
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Stream {streaming ? 'on' : 'off'}
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={messagesRef} className="messages-scroll flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="flex h-full flex-col items-center justify-center px-4">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6366f1"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="mb-1 text-xl font-semibold text-gray-900">
              How can I help you?
            </h2>
            <p className="text-sm text-gray-400">
              Send a message to start a conversation.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
            <div className="flex flex-col gap-1">
              {messages.map((msg, i) => (
                <div key={i} className="animate-[fade-in_0.2s_ease-out]">
                  {msg.role === 'user' ? (
                    <div className="flex justify-end py-2">
                      <div className="max-w-[85%] rounded-2xl rounded-br bg-gray-900 px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-sm whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="py-2">
                      <div className="flex gap-3">
                        <div className="flex-none pt-0.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#6366f1"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
                              <path d="M6 10v2a6 6 0 0 0 12 0v-2" />
                              <line x1="12" y1="18" x2="12" y2="22" />
                              <line x1="8" y1="22" x2="16" y2="22" />
                            </svg>
                          </div>
                        </div>
                        <div className="prose prose-sm prose-gray min-w-0 max-w-none">
                          <Markdown>{msg.content}</Markdown>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Thinking indicator */}
              {busy && !streamingContent && (
                <div className="animate-[fade-in_0.2s_ease-out] py-2">
                  <div className="flex gap-3">
                    <div className="flex-none pt-0.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#6366f1"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
                          <path d="M6 10v2a6 6 0 0 0 12 0v-2" />
                          <line x1="12" y1="18" x2="12" y2="22" />
                          <line x1="8" y1="22" x2="16" y2="22" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pt-2">
                      <div
                        className="h-1.5 w-1.5 rounded-full bg-gray-300"
                        style={{
                          animation: 'bounce-dot 1.2s ease-in-out infinite',
                        }}
                      />
                      <div
                        className="h-1.5 w-1.5 rounded-full bg-gray-300"
                        style={{
                          animation:
                            'bounce-dot 1.2s ease-in-out infinite 0.2s',
                        }}
                      />
                      <div
                        className="h-1.5 w-1.5 rounded-full bg-gray-300"
                        style={{
                          animation:
                            'bounce-dot 1.2s ease-in-out infinite 0.4s',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Streaming content */}
              {streamingContent && (
                <div className="py-2">
                  <div className="flex gap-3">
                    <div className="flex-none pt-0.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#6366f1"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
                          <path d="M6 10v2a6 6 0 0 0 12 0v-2" />
                          <line x1="12" y1="18" x2="12" y2="22" />
                          <line x1="8" y1="22" x2="16" y2="22" />
                        </svg>
                      </div>
                    </div>
                    <div className="prose prose-sm prose-gray min-w-0 max-w-none">
                      <Markdown>{streamingContent}</Markdown>
                      <span
                        className="ml-0.5 inline-block h-4 w-[2px] translate-y-[2px] bg-indigo-500"
                        style={{ animation: 'blink 1s step-end infinite' }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-none border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          <div className="flex items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm transition-all focus-within:border-indigo-300 focus-within:bg-white focus-within:shadow-md focus-within:ring-2 focus-within:ring-indigo-100">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              autoComplete="off"
              className="flex-1 resize-none border-none bg-transparent py-1.5 text-sm leading-normal text-gray-900 outline-none placeholder:text-gray-400"
              style={{ minHeight: 24, maxHeight: 160 }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || busy}
              aria-label="Send"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-300">
            Powered by Mentiora
          </p>
        </div>
      </div>
    </div>
  );
}
