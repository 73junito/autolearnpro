Reviewer checklist

- [ ] Confirm the updated coverage behavior is acceptable (we added `COVERAGE_OPTIONAL` to opt out)
- [ ] Confirm the shim behavior is acceptable for your runners (installs to $HOME/bin and is intentionally conservative)
- [ ] Run CI on this branch and validate coverage artifact upload + threshold step
- [ ] (Optional) Suggest alternate installation location if your org requires a different policy

Notes
- `COVERAGE_OPTIONAL` defaults to `0`. Set it to `1` only for jobs where coverage generation is intentionally skipped (docs-only changes, etc.).
- The shim is intentionally minimal: it returns empty output for `list`/`ps` and exits non-zero for commands that would run models.
