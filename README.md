# baby-programming

幼児向けのプログラミング体験ゲームを、アプリごとのディレクトリで管理します。

| アプリ | ファイル・遊び方 | Web公開先 |
| --- | --- | --- |
| はちさんと おはな | [bee-and-flower](bee-and-flower/README.md) | [ゲームで遊ぶ](https://atsuhi.ro/apps/baby-programming/bee-and-flower/) |

各アプリのHTML・画像・README・テストは `<アプリ名>/` にまとめます。「はちさんと おはな」は `bee-and-flower/index.html` をブラウザーで開くと、オフラインでも遊べます。

## 開発時の確認

Node.jsがある環境で、リポジトリのルートから全アプリのテストを実行できます。外部パッケージの追加は不要です。

```text
node --test
```

## 自動公開

`main`の更新後、テストに成功するとGitHub Actionsが `a2h1r0/personal-page` の `master` に以下のファイルを同期します。個人サイト側のAstroビルドを経て、公開サイトへ反映されます。

| 編集元 | 個人サイトへの同期先 |
| --- | --- |
| `bee-and-flower/index.html` | `src/pages/apps/baby-programming/bee-and-flower/index.html` |
| `bee-and-flower/favicon.ico` | `public/apps/baby-programming/bee-and-flower/favicon.ico` |
| `bee-and-flower/image.png` | `public/apps/baby-programming/bee-and-flower/image.png` |

公開設定はHTMLに直接記載し、公開時にそのままコピーします。新しいアプリを追加する場合は、`.github/workflows/publish.yml` のコピー対象とコミット対象にも追加してください。

公開先が更新されない場合は、このリポジトリの **Publish to personal site** と、個人サイトの **Deploy to GitHub Pages** の実行結果を確認してください。
