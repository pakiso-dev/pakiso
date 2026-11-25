import { defineConfig } from 'vitepress';

const base = '/pakiso/';

/**
 * Single ordered sidebar tree. VitePress derives both the collapsible left-hand
 * nav and the prev/next pager at the bottom of each article from this list, so
 * reading order and navigation stay in sync by construction — the same pattern
 * docs.nestjs.com uses for its NAV_ITEMS tree.
 */
const sidebar = [
  {
    text: 'Introduction',
    items: [{ text: 'What is Pakiso?', link: '/introduction' }],
  },
  {
    text: 'Overview',
    collapsed: false,
    items: [
      { text: 'First steps', link: '/overview/first-steps' },
      { text: 'Pakiso engine', link: '/overview/pakiso-engine' },
      { text: 'Pakiso context', link: '/overview/pakiso-context' },
      { text: 'Storage adapters', link: '/overview/storage-adapters' },
      { text: 'Attestation gates', link: '/overview/attestation-gates' },
    ],
  },
  {
    text: 'Fundamentals',
    collapsed: true,
    items: [
      { text: 'Custom storage adapters', link: '/fundamentals/custom-storage-adapters' },
      { text: 'Deployment', link: '/fundamentals/deployment' },
      { text: 'Encryption', link: '/fundamentals/encryption' },
      { text: 'Idempotency', link: '/fundamentals/idempotency' },
      { text: 'Redaction', link: '/fundamentals/redaction' },
      { text: 'Replay', link: '/fundamentals/replay' },
      { text: 'Testing', link: '/fundamentals/testing' },
    ],
  },
  {
    text: 'NestJS integration',
    collapsed: true,
    items: [
      { text: 'PakisoModule', link: '/nestjs/module' },
      { text: 'Decorators', link: '/nestjs/decorators' },
      { text: 'Discovery service', link: '/nestjs/discovery-service' },
      { text: 'REST control plane', link: '/nestjs/rest-control-plane' },
      { text: 'Dashboard', link: '/nestjs/dashboard' },
    ],
  },
  {
    text: 'Storage',
    collapsed: true,
    items: [{ text: 'Prisma adapter', link: '/storage/prisma-adapter' }],
  },
  {
    text: 'CLI',
    collapsed: true,
    items: [{ text: 'pakiso init / inspect / replay', link: '/cli/overview' }],
  },
  {
    text: 'Recipes',
    collapsed: true,
    items: [{ text: 'Durable user-onboarding workflow', link: '/recipes/onboarding-walkthrough' }],
  },
  {
    text: 'FAQ',
    items: [{ text: 'Frequently asked questions', link: '/faq' }],
  },
];

export default defineConfig({
  title: 'Pakiso',
  description: 'A stateful, deterministic, auditable execution framework for Node.js and NestJS.',
  // Served as a GitHub Pages project site at https://pakiso-dev.github.io/pakiso/
  base,
  srcDir: '.',
  srcExclude: ['README.md'],
  outDir: 'dist',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', type: 'image/png', href: `${base}favicon.png` }]],

  themeConfig: {
    logo: { light: '/logo-light.png', dark: '/logo-dark.png' },
    nav: [
      { text: 'Guide', link: '/introduction' },
      { text: 'CLI', link: '/cli/overview' },
      { text: 'Recipes', link: '/recipes/onboarding-walkthrough' },
    ],
    sidebar,
    socialLinks: [{ icon: 'github', link: 'https://github.com/pakiso-dev/pakiso' }],
    editLink: {
      pattern: 'https://github.com/pakiso-dev/pakiso/edit/main/packages/docs/:path',
      text: 'Edit this page on GitHub',
    },
    search: {
      provider: 'local',
    },
    outline: {
      level: [2, 3],
    },
  },
});
