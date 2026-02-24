import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Mentiora SDK',
  tagline: 'Official SDK for the Mentiora platform - AI observability and tracing',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://mentiora-ai.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // This site is served at the root path
  baseUrl: '/',
  trailingSlash: false,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'mentiora-ai',
  projectName: 'mentiora-sdk',

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: [
    ['@easyops-cn/docusaurus-search-local', {
      hashed: true,
      language: ['en'],
      highlightSearchTermsOnTargetPage: true,
      explicitSearchResultPath: true,
    }],
  ],

  plugins: [
    ['@docusaurus/plugin-client-redirects', {
      redirects: [
        { from: '/getting-started', to: '/quick-start' },
        { from: '/installation', to: '/quick-start' },
      ],
    }],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/mentiora-ai/mentiora-sdk/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    metadata: [
      { name: 'og:type', content: 'website' },
      { name: 'og:site_name', content: 'Mentiora SDK Documentation' },
    ],
    image: 'img/og-image.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Mentiora SDK',
      logo: {
        alt: 'Mentiora SDK Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'custom-sdkLanguageSwitcher',
          position: 'right',
        },
        {
          href: 'https://github.com/mentiora-ai/mentiora-sdk',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Quick Start',
              to: '/quick-start',
            },
            {
              label: 'Usage',
              to: '/usage',
            },
            {
              label: 'API Reference',
              to: '/api-reference',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/mentiora-ai/mentiora-sdk',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Mentiora Platform',
              href: 'https://mentiora.ai',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Mentiora.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
