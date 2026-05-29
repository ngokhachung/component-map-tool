# Component Mapping

## Vision

Build an in-house **Component Map Tool** that takes a component-id as input and outputs a dependency graph (parents/children) plus the UI access path (how to reach that component in the running app). The goal is to cut the time developers spend tracing the impact of a component change and finding how a component is reached on the UI, for an Angular codebase of 100-500 components.

## Problem Statement

When a developer edits a single Angular component, they spend significant time (a) finding the impact (which parents/routes are affected) and (b) figuring out how to navigate to that component in the UI. Current workflow relies on IDE search, grep, or asking senior devs — slow and error-prone, leading to "missed impact" bugs. The tool solves this by combining static analysis (ts-morph + @angular/compiler) with optional per-component Markdown metadata, surfaced early via a PR bot.

## Success Criteria

- Impact tracing time reduced ≥50% after 3 months of use
- ≥95% of parents correctly listed (verified against 20 manual samples)
- Full index rebuild < 60s on 500 components; incremental build < 5s
- PR bot comments accurate ≥90% (sampled over 20 random PRs)
- ≥80% of `.md` files have a UI Access Path section; ≥70% of devs report the tool is helpful
- Zero "missed impact" incidents caused by a false-negative tool report

## Constraints

- No external open-source analysis tools (Compodoc, Nx, ng-analyzer) due to security policy — build in-house
- Must support both NgModule-based and standalone components (Angular 14+); parser strategy keyed off detected Angular version
- HTML report must be single-file/offline-capable for security compliance
- `@angular/compiler` API is not stable across Angular major versions — pin version, maintain a compatibility matrix
- Tool maintainer must be confirmed before implementation begins (avoid "build then no owner")
- Sunset criteria: if adoption < 30% or accuracy < 70% after 3 months → review/pivot/sunset

## Stack

- TypeScript / Node.js CLI tool (domain: Angular static analysis)
- `ts-morph` for TypeScript AST extraction; `@angular/compiler` for template parsing
- Graph storage + query API with file-hash-based cache invalidation
- PR bot via GitHub Action / GitLab CI; Mermaid + standalone HTML renderer
- Stack tag: `angular` (Angular domain expertise required — NgModule/standalone, routing, compiler internals)

## Created

2026-05-29
