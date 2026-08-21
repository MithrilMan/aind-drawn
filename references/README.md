# External reference sources

This directory contains local checkouts used to study upstream projects. The
checkouts are intentionally ignored by Git; the reconstruction instructions and
the exact reviewed revision remain versioned.

## KinderGrimm

Clone the repository into this directory:

```bash
git clone https://github.com/albertobeiz/kindergrimm.git references/kindergrimm
```

Then check out the revision stored in
`references/kindergrimm.reference.json`:

```bash
git -C references/kindergrimm checkout 811214c6dd5de18cc20335cd3d4ab0a06e45ffd4
```

PowerShell equivalent:

```powershell
git clone https://github.com/albertobeiz/kindergrimm.git references/kindergrimm
git -C references/kindergrimm checkout 811214c6dd5de18cc20335cd3d4ab0a06e45ffd4
```

When intentionally updating the reference, review the upstream diff first and
update both the checkout and `referenceCommit`. Do not silently follow the
remote default branch: reproducible archaeology beats surprise upgrades.

Verify that the local checkout still matches the recorded HEAD:

```bash
pnpm reference:verify
```

The verifier also validates the metadata shape, checkout boundary, `origin`
URL, commit object, and absence of modifications to tracked upstream files.
Untracked installation artifacts are ignored.

To inspect a possible upstream update without changing the checkout:

```bash
git ls-remote https://github.com/albertobeiz/kindergrimm.git refs/heads/main
git -C references/kindergrimm diff 811214c6dd5de18cc20335cd3d4ab0a06e45ffd4..origin/main
```

KinderGrimm includes an Unlicense dedication at the pinned revision. Preserve
the upstream provenance in the technical study when adapting its ideas.
