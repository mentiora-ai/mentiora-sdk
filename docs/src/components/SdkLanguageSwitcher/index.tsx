import type { SdkLanguage } from '@site/src/hooks/useSdkLanguage';
import { useSdkLanguage } from '@site/src/hooks/useSdkLanguage';
import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './styles.module.css';

export default function SdkLanguageSwitcher(): React.JSX.Element {
  const { language, setLanguage, languages } = useSdkLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeLabel =
    languages.find((l) => l.value === language)?.label ?? 'Language';

  const handleSelect = useCallback(
    (value: SdkLanguage) => {
      setLanguage(value);
      setOpen(false);
    },
    [setLanguage],
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} className={clsx('navbar__item', styles.dropdown)}>
      <button
        className={styles.trigger}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {activeLabel}
        <span className={styles.arrow}>&#9662;</span>
      </button>
      <ul
        className={clsx(styles.menu, open && styles.menuVisible)}
        role="listbox"
      >
        {languages.map((lang) => (
          <li key={lang.value}>
            <button
              role="option"
              aria-selected={language === lang.value}
              className={clsx(
                styles.menuItem,
                language === lang.value && styles.menuItemActive,
              )}
              onClick={() => handleSelect(lang.value)}
            >
              {lang.label}
              {language === lang.value && (
                <span className={styles.check}>&#10003;</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
