import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    'quick-start',
    'authentication',
    {
      type: 'category',
      label: 'Usage',
      collapsed: false,
      link: { type: 'doc', id: 'usage/index' },
      items: [
        'usage/tracing',
        'usage/agents',
        'usage/plugins',
        'usage/streaming-helpers',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      collapsed: true,
      link: { type: 'doc', id: 'api-reference/index' },
      items: [
        'api-reference/client',
        'api-reference/tracing',
        'api-reference/agents',
        'api-reference/streaming-helpers',
        'api-reference/plugins',
        'api-reference/errors',
      ],
    },
    'examples',
  ],
};

export default sidebars;
