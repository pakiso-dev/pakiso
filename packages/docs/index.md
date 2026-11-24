---
layout: home

hero:
  name: Causal
  text: Stateful, deterministic, auditable execution for Node.js
  tagline: >-
    Durable workflows with bring-your-own-storage, human/policy attestation
    gates, and local trace replay — for plain Node.js and NestJS.
  actions:
    - theme: brand
      text: What is Causal?
      link: /introduction
    - theme: alt
      text: First steps
      link: /overview/first-steps
    - theme: alt
      text: View on GitHub
      link: https://github.com/causal-dev/causal

features:
  - title: Bring your own storage
    details: >-
      CausalStorageAdapter is a small, explicit interface. Ship with the
      zero-dependency in-memory adapter for tests, or the multi-dialect
      Prisma adapter for Postgres/MySQL/SQLite — or write your own.
  - title: Durable attestation gates
    details: >-
      ctx.awaitAttestation() suspends a run until a human or policy decision
      arrives, then resumes exactly where it left off — no polling, no lost
      state across process restarts.
  - title: Deterministic replay
    details: >-
      Every step and gate is journaled. causal replay reruns a recorded run
      against your real handlers locally, with optional step stubs, to
      reproduce bugs deterministically.
  - title: First-class NestJS integration
    details: >-
      @causal/nest wires a CausalEngine into Nest's DI container and
      discovers @Workflow()-decorated methods at bootstrap, with
      idempotency-header and response-redaction helpers for your REST layer.
---
