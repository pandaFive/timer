# TODO

## Low Priority (レビュー日: 2026-02-13)

- [ ] `--color-completed-start/end` を `var(--color-accent)` / `var(--color-accent-hover)` 参照に変更
  - ファイル: `src/App.css:17-18`
  - 理由: 現在accent色と同一値。将来分離する予定がなければトークン参照に統一

- [ ] `summary-enter` と `screen-enter` keyframesの統合検討
  - ファイル: `src/App.css`
  - 理由: translateY(12px) vs translateY(8px) の差のみ。4pxの差が知覚可能か要検証

- [ ] controlsボタンの `rgba()` インラインborder-color値をトークン化
  - ファイル: `src/App.css` (.controls__btn--toggle, --skip, --reset, .summary__stat)
  - 理由: デザイントークンシステムとの一貫性向上
