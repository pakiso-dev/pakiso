import { defineConfig } from 'vitepress';

/**
 * Single ordered sidebar tree. VitePress derives both the collapsible left-hand
 * nav and the prev/next pager at the bottom of each article from this list, so
 * reading order and navigation stay in sync by construction — the same pattern
 * docs.nestjs.com uses for its NAV_ITEMS tree.
 */
const sidebar = [
  {
    text: 'Introduction',
    items: [{ text: 'What is Causal?', link: '/introduction' }],
  },
  {
    text: 'Overview',
    collapsed: false,
    items: [
      { text: 'First steps', link: '/overview/first-steps' },
      { text: 'Causal engine', link: '/overview/causal-engine' },
      { text: 'Causal context', link: '/overview/causal-context' },
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
      { text: 'CausalModule', link: '/nestjs/module' },
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
    items: [{ text: 'causal init / inspect / replay', link: '/cli/overview' }],
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
  title: 'Causal',
  description: 'A stateful, deterministic, auditable execution framework for Node.js and NestJS.',
  srcDir: '.',
  srcExclude: ['README.md'],
  outDir: 'dist',
  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/introduction' },
      { text: 'CLI', link: '/cli/overview' },
      { text: 'Recipes', link: '/recipes/onboarding-walkthrough' },
    ],
    sidebar,
    socialLinks: [{ icon: 'github', link: 'https://github.com/causal-dev/causal' }],
    editLink: {
      pattern: 'https://github.com/causal-dev/causal/edit/main/packages/docs/:path',
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
