Patches and how to apply them
=============================

This repository includes a patch that fixes Windows-specific test failures in the `ollama-python` submodule.

Patch file
- `patches/0001-tests-fix-Windows-tempfile-re-open-by-using-delete-F.patch`

How to apply the patch to a fork of `ollama/ollama-python`

1. Clone your fork of `ollama-python` (create a fork on GitHub first if you don't have one):

```bash
git clone git@github.com:<your-github-username>/ollama-python.git
cd ollama-python
git checkout -b fix/windows-tempfile-tests
git am /path/to/patches/0001-tests-fix-Windows-tempfile-re-open-by-using-delete-F.patch
git push --set-upstream origin fix/windows-tempfile-tests
```

2. Open a PR from `fix/windows-tempfile-tests` in your fork to `ollama/ollama-python:main`.

If you prefer to push the submodule branch directly from the parent repo (requires your fork to exist and your git credentials to allow push):

```powershell
Push-Location lib/ollama-python
git remote add myfork https://github.com/<your-github-username>/ollama-python.git
git push myfork HEAD:refs/heads/fix/windows-tempfile-tests
Pop-Location
```

If you want me to push the branch to your fork and open the PR, provide the fork URL (HTTPS or SSH) or create the fork and let me know — I can then push and provide the PR link.
