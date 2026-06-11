---
title: nightjar v0.1
date: 2026-06-11
---

# nightjar v0.1

Today we are releasing nightjar v0.1, a tiny terminal pastebin for
people who live in a shell. It does one thing. You pipe text in, it
hands back a short URL, and the paste expires when you told it to.

There is no account, no tracking, and no dashboard to learn. The list
view is a plain monospace table: id, title, age, size, and a view
count. Pastes default to a seven day life and then they are gone.

nightjar runs as a single small binary. It reads from standard input,
writes the URL to standard output, and stays quiet otherwise, so it
composes cleanly with the rest of your pipeline.

This first cut is deliberately small. Expiry, raw fetch, and a short
URL scheme are in. Syntax highlighting and a search index are not, and
that is fine for now.
