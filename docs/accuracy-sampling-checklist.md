# Accuracy Sampling Checklist (manual, quarterly)

Automated tests cover correctness on fixtures; this manual sample measures real-world accuracy and is
run alongside the quarterly audit pipeline. ~30–60 minutes.

1. From the quarterly audit report, pick **10 random components** (mix of leaf / mid / shared).
2. For each, run `cmap query <component>` and read the impact (ancestors) + UI access paths.
3. A reviewer who knows the area verifies each by hand (IDE search / runtime knowledge):
   - [ ] Are all listed ancestors real parents?
   - [ ] Any **missing** parent the tool didn't find? (Likely an undocumented dynamic dep → add a `.cmap.yaml` `target` or `waived`.)
   - [ ] Are the UI access-path routes correct?
4. Log: `accuracy = correct reports / 10`. Record the date + % in a running table (team wiki or this repo).
5. If accuracy < 90%, triage the misses: dynamic-dep gaps (fixable via overrides) vs parser bugs (file an issue).

> Uncertainty is already surfaced: impact/access-paths through `indirect`/`unresolved-static` edges are flagged
> "uncertain", and `cmap gaps` / `cmap audit` list undocumented dynamic constructs.
