/**
 * useScroll — Smart auto-scroll with "user scrolled up" detection.
 *
 * Tracks scroll position relative to bottom. When user scrolls up > 100px,
 * enters "pinned" mode where new messages don't auto-scroll. Shows a
 * "New messages" pill. User's own messages always scroll to bottom.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const SCROLL_THRESHOLD = 100;

export interface UseScrollOptions {
  /** Number of messages — used to detect new messages */
  messageCount: number;
  /** Whether the latest message was sent by the user */
  isLatestMessageFromUser: boolean;
}

export interface UseScrollReturn {
  /** Ref to attach to the scrollable container */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Whether new messages are available below the viewport */
  showNewMessagesPill: boolean;
  /** Scroll to bottom (exits pinned mode) */
  scrollToBottom: () => void;
}

export function useScroll(options: UseScrollOptions): UseScrollReturn {
  const { messageCount, isLatestMessageFromUser } = options;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false);
  const prevMessageCount = useRef(messageCount);
  const userScrolledRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setIsPinned(false);
    setShowNewMessagesPill(false);
    userScrolledRef.current = false;
  }, []);

  // Track user scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const isAtBottom = distanceFromBottom < SCROLL_THRESHOLD;

      if (isAtBottom) {
        setIsPinned(false);
        setShowNewMessagesPill(false);
        userScrolledRef.current = false;
      } else {
        userScrolledRef.current = true;
        setIsPinned(true);
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messageCount <= prevMessageCount.current) {
      prevMessageCount.current = messageCount;
      return;
    }
    prevMessageCount.current = messageCount;

    // User's own messages always scroll to bottom
    if (isLatestMessageFromUser) {
      scrollToBottom();
      return;
    }

    // If not pinned, auto-scroll
    if (!isPinned) {
      const el = scrollRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    } else {
      // User is scrolled up — show pill
      setShowNewMessagesPill(true);
    }
  }, [messageCount, isLatestMessageFromUser, isPinned, scrollToBottom]);

  return {
    scrollRef,
    showNewMessagesPill,
    scrollToBottom,
  };
}
