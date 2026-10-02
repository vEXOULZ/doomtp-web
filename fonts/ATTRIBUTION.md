# twemoji-sign.woff2

One glyph (U+1F3DC, 🏜 desert, the bot's default command sign) cut from
[Twemoji Mozilla](https://github.com/mozilla/twemoji-colr) v0.7.0 (`Twemoji.Mozilla.ttf`) with fontTools:

```bash
pyftsubset Twemoji.Mozilla.ttf --unicodes=U+1F3DC --flavor=woff2 --output-file=twemoji-sign.woff2
```

- The emoji art is [Twemoji](https://github.com/twitter/twemoji), © Twitter, Inc. and other contributors,
  licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- The font build is © Mozilla Foundation, licensed under the
  [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

To draw another character this way, add its codepoint to `--unicodes` (and to the `unicode-range` in
`src/styles.css`).
