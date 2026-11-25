---
"@pakiso/core": patch
"@pakiso/cli": patch
"@pakiso/dashboard": patch
"@pakiso/nest": patch
"@pakiso/storage-prisma": patch
---

Add MIT `LICENSE` file at the repo root and a `license` field to every package's `package.json`. Previously no license was declared, so npm defaulted published packages to showing "Proprietary" on the registry despite the GitHub repo being public.
