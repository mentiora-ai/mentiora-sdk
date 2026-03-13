import { useCallback, useMemo, useState } from 'react';
import { MentioraClient } from '@mentiora.ai/sdk';
import { ChatWidget } from '@mentiora.ai/sdk/ui';
import type { ChatTheme } from '@mentiora.ai/sdk/ui';
import '@mentiora.ai/sdk/ui/styles.css';

// ── HSL Helpers ──

/** Parse "H S% L%" string into [h, s, l] numbers. */
function parseHSL(hsl: string): [number, number, number] {
  const parts = hsl.split(/\s+/);
  return [
    parseInt(parts[0], 10) || 0,
    parseInt(parts[1], 10) || 0,
    parseInt(parts[2], 10) || 0,
  ];
}

/** Format [h, s, l] back to CSS "H S% L%" string. */
function formatHSL(h: number, s: number, l: number): string {
  return `${h} ${s}% ${l}%`;
}

/** Convert HSL to hex (for color input). */
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lN - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Convert hex to HSL [h, s, l]. */
function hexToHSL(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// ── Theme Color Definitions ──

interface ThemeColor {
  key: `--mntr-${string}`;
  label: string;
  defaultHSL: string;
}

const THEME_COLORS: ThemeColor[] = [
  { key: '--mntr-primary', label: 'Primary', defaultHSL: '220 90% 56%' },
  { key: '--mntr-primary-foreground', label: 'Primary Text', defaultHSL: '0 0% 100%' },
  { key: '--mntr-background', label: 'Background', defaultHSL: '0 0% 100%' },
  { key: '--mntr-foreground', label: 'Foreground', defaultHSL: '222 47% 11%' },
  { key: '--mntr-muted', label: 'Muted', defaultHSL: '210 40% 96%' },
  { key: '--mntr-muted-foreground', label: 'Muted Text', defaultHSL: '215 16% 47%' },
  { key: '--mntr-border', label: 'Border', defaultHSL: '214 32% 91%' },
  { key: '--mntr-destructive', label: 'Error', defaultHSL: '0 84% 60%' },
];

// ── Preset Themes ──

const PRESETS: Record<string, Record<string, string>> = {
  Light: Object.fromEntries(THEME_COLORS.map((c) => [c.key, c.defaultHSL])),
  Dark: {
    '--mntr-primary': '220 90% 56%',
    '--mntr-primary-foreground': '0 0% 100%',
    '--mntr-background': '222 47% 11%',
    '--mntr-foreground': '210 40% 98%',
    '--mntr-muted': '217 33% 17%',
    '--mntr-muted-foreground': '215 20% 65%',
    '--mntr-border': '217 33% 17%',
    '--mntr-destructive': '0 63% 31%',
  },
  Ocean: {
    '--mntr-primary': '199 89% 48%',
    '--mntr-primary-foreground': '0 0% 100%',
    '--mntr-background': '200 20% 98%',
    '--mntr-foreground': '200 50% 10%',
    '--mntr-muted': '200 30% 93%',
    '--mntr-muted-foreground': '200 15% 45%',
    '--mntr-border': '200 25% 88%',
    '--mntr-destructive': '0 84% 60%',
  },
  Forest: {
    '--mntr-primary': '152 60% 40%',
    '--mntr-primary-foreground': '0 0% 100%',
    '--mntr-background': '140 15% 97%',
    '--mntr-foreground': '150 40% 10%',
    '--mntr-muted': '140 20% 92%',
    '--mntr-muted-foreground': '150 10% 45%',
    '--mntr-border': '140 20% 87%',
    '--mntr-destructive': '0 70% 55%',
  },
  Purple: {
    '--mntr-primary': '270 70% 55%',
    '--mntr-primary-foreground': '0 0% 100%',
    '--mntr-background': '270 15% 98%',
    '--mntr-foreground': '270 40% 12%',
    '--mntr-muted': '270 20% 93%',
    '--mntr-muted-foreground': '270 15% 50%',
    '--mntr-border': '270 20% 88%',
    '--mntr-destructive': '0 80% 58%',
  },
};

// ── App ──

export function App() {
  // Connection
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://platform.mentiora.ai');
  const [agentTag, setAgentTag] = useState('');
  const [connected, setConnected] = useState(false);

  // Theme
  const [colors, setColors] = useState<Record<string, string>>(
    () => PRESETS['Light'],
  );
  const [radius, setRadius] = useState('0.75');
  const [fontSize, setFontSize] = useState('0.875');
  const [position, setPosition] = useState<'bottom-right' | 'bottom-left' | 'inline'>('inline');

  // Widget settings
  const [title, setTitle] = useState('Mentiora Assistant');
  const [greeting, setGreeting] = useState('Hi! How can I help you today?');
  const [placeholder, setPlaceholder] = useState('Type a message...');

  const client = useMemo(() => {
    if (!connected || !apiKey) return null;
    return new MentioraClient({ apiKey, baseUrl: baseUrl || undefined });
  }, [connected, apiKey, baseUrl]);

  const theme = useMemo<ChatTheme>(() => {
    return {
      ...colors,
      '--mntr-radius': `${radius}rem`,
      '--mntr-font-size-base': `${fontSize}rem`,
    } as ChatTheme;
  }, [colors, radius, fontSize]);

  const handleConnect = useCallback(() => {
    if (!apiKey.trim()) return;
    setConnected(true);
  }, [apiKey]);

  const handleDisconnect = useCallback(() => {
    setConnected(false);
  }, []);

  const handleColorChange = useCallback((key: string, hex: string) => {
    const [h, s, l] = hexToHSL(hex);
    setColors((prev) => ({ ...prev, [key]: formatHSL(h, s, l) }));
  }, []);

  const handlePreset = useCallback((name: string) => {
    setColors(PRESETS[name]);
  }, []);

  return (
    <div style={styles.page}>
      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <h1 style={styles.sidebarTitle}>Mentiora Chat Widget</h1>
        <p style={styles.subtitle}>E2E Example</p>

        {/* Connection */}
        <Section title="Connection">
          <label style={styles.label}>
            API Key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="mntr_..."
              style={styles.input}
              disabled={connected}
            />
          </label>
          <label style={styles.label}>
            Base URL
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              style={styles.input}
              disabled={connected}
            />
          </label>
          <label style={styles.label}>
            Agent Tag
            <input
              type="text"
              value={agentTag}
              onChange={(e) => setAgentTag(e.target.value)}
              placeholder="e.g. support-bot"
              style={styles.input}
              disabled={connected}
            />
          </label>
          {!connected ? (
            <button
              onClick={handleConnect}
              disabled={!apiKey.trim()}
              style={{
                ...styles.button,
                ...(apiKey.trim() ? styles.buttonPrimary : styles.buttonDisabled),
              }}
            >
              Connect
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              style={{ ...styles.button, ...styles.buttonDanger }}
            >
              Disconnect
            </button>
          )}
        </Section>

        {/* Widget Config */}
        <Section title="Widget">
          <label style={styles.label}>
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            Greeting
            <input
              type="text"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            Placeholder
            <input
              type="text"
              value={placeholder}
              onChange={(e) => setPlaceholder(e.target.value)}
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            Position
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as typeof position)}
              style={styles.input}
            >
              <option value="inline">Inline</option>
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
            </select>
          </label>
        </Section>

        {/* Theme Presets */}
        <Section title="Theme Presets">
          <div style={styles.presetRow}>
            {Object.keys(PRESETS).map((name) => (
              <button
                key={name}
                onClick={() => handlePreset(name)}
                style={styles.presetButton}
              >
                {name}
              </button>
            ))}
          </div>
        </Section>

        {/* Theme Colors */}
        <Section title="Theme Colors">
          {THEME_COLORS.map((tc) => {
            const [h, s, l] = parseHSL(colors[tc.key] ?? tc.defaultHSL);
            const hex = hslToHex(h, s, l);
            return (
              <label key={tc.key} style={styles.colorRow}>
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => handleColorChange(tc.key, e.target.value)}
                  style={styles.colorInput}
                />
                <span style={styles.colorLabel}>{tc.label}</span>
                <span style={styles.colorValue}>{colors[tc.key]}</span>
              </label>
            );
          })}
        </Section>

        {/* Theme Sizing */}
        <Section title="Sizing">
          <label style={styles.label}>
            Border Radius: {radius}rem
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.125"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              style={styles.range}
            />
          </label>
          <label style={styles.label}>
            Font Size: {fontSize}rem
            <input
              type="range"
              min="0.75"
              max="1.125"
              step="0.0625"
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              style={styles.range}
            />
          </label>
        </Section>
      </aside>

      {/* ── Main Area ── */}
      <main style={styles.main}>
        {!client ? (
          <div style={styles.placeholder}>
            <div style={styles.placeholderIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 style={styles.placeholderTitle}>Chat Widget Preview</h2>
            <p style={styles.placeholderText}>
              Enter your API key and click Connect to start chatting.
            </p>
          </div>
        ) : position === 'inline' ? (
          <div style={styles.inlineContainer}>
            <ChatWidget
              client={client}
              agentTag={agentTag || undefined}
              theme={theme}
              position="inline"
              title={title}
              greeting={greeting}
              placeholder={placeholder}
              persistHistory={false}
            />
          </div>
        ) : (
          <div style={styles.floatingPreview}>
            <p style={styles.floatingText}>
              The chat bubble is in the {position.replace('-', ' ')} corner.
            </p>
            <ChatWidget
              client={client}
              agentTag={agentTag || undefined}
              theme={theme}
              position={position}
              title={title}
              greeting={greeting}
              placeholder={placeholder}
              persistHistory={false}
            />
          </div>
        )}
      </main>
    </div>
  );
}

// ── Section Component ──

function Section(props: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>{props.title}</h3>
      {props.children}
    </div>
  );
}

// ── Styles ──

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    height: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#1a1a2e',
    background: '#f8f9fb',
    margin: 0,
  },
  sidebar: {
    width: 340,
    flexShrink: 0,
    padding: '1.5rem 1.25rem',
    overflowY: 'auto',
    borderRight: '1px solid #e5e7eb',
    background: '#ffffff',
  },
  sidebarTitle: {
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: 700,
  },
  subtitle: {
    margin: '0.25rem 0 1rem',
    fontSize: '0.8125rem',
    color: '#6b7280',
  },
  section: {
    marginBottom: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#9ca3af',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
  },
  input: {
    padding: '0.4rem 0.625rem',
    fontSize: '0.8125rem',
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    background: '#f9fafb',
    outline: 'none',
    fontFamily: 'inherit',
  },
  range: {
    width: '100%',
    accentColor: '#3b82f6',
  },
  button: {
    padding: '0.5rem 1rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 150ms',
  },
  buttonPrimary: {
    background: '#3b82f6',
    color: '#fff',
  },
  buttonDanger: {
    background: '#ef4444',
    color: '#fff',
  },
  buttonDisabled: {
    background: '#e5e7eb',
    color: '#9ca3af',
    cursor: 'not-allowed',
  },
  presetRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  presetButton: {
    padding: '0.3rem 0.75rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    border: '1px solid #e5e7eb',
    borderRadius: '999px',
    background: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 150ms, border-color 150ms',
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.8125rem',
    cursor: 'pointer',
  },
  colorInput: {
    width: 28,
    height: 28,
    padding: 0,
    border: '1px solid #e5e7eb',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    background: 'none',
  },
  colorLabel: {
    flex: 1,
    fontWeight: 500,
  },
  colorValue: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '0.6875rem',
    color: '#9ca3af',
  },
  main: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    position: 'relative',
  },
  placeholder: {
    textAlign: 'center',
    color: '#9ca3af',
  },
  placeholderIcon: {
    marginBottom: '1rem',
  },
  placeholderTitle: {
    margin: '0 0 0.5rem',
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#6b7280',
  },
  placeholderText: {
    margin: 0,
    fontSize: '0.875rem',
  },
  inlineContainer: {
    width: '100%',
    maxWidth: 480,
    height: '600px',
  },
  floatingPreview: {
    textAlign: 'center',
    color: '#9ca3af',
  },
  floatingText: {
    fontSize: '0.875rem',
  },
};
