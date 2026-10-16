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

`main`の更新後、テストに成功すると、GitHub Appで個人サイトの **Deploy to GitHub Pages** を直接起動します。テスト済みのSHAは実行時の入力として渡し、個人サイトのファイルやコミットには保存しません。

個人サイト側はその版を一時取得して再テストし、Astroのビルド後に `bee-and-flower/index.html`・`favicon.ico`・`image.png` を `dist/apps/baby-programming/bee-and-flower/` にコピーして公開します。公開設定はHTMLに直接記載します。新しいアプリを追加する場合は、個人サイト側の公開用コピー対象にも追加してください。

古い実行の再実行では新しい `main` が存在する場合に通知をスキップします。個人サイトでも公開直前に両リポジトリの更新を確認し、古い版への巻き戻しを防ぎます。テストやコピーに失敗した場合は、現在公開中のサイトを維持します。

### 初期設定

1. 自分専用のGitHub Appを作成し、Repository permissionsの **Actions: Read and write** を付けます。Webhookは不要です。
2. Appを **`a2h1r0/personal-page`だけ**にインストールします。
3. このリポジトリの **Settings → Secrets and variables → Actions** に、Variable `SITE_DEPLOY_APP_CLIENT_ID`（AppのClient ID）とSecret `SITE_DEPLOY_APP_PRIVATE_KEY`（生成した秘密鍵のPEM全文）を登録します。
4. 先に個人サイト側の取り込み・`game_revision`入力対応をマージし、次にこの通知処理をマージします。

トークンは実行時に自動発行します。以前の `PERSONAL_PAGE_DEPLOY_KEY` はこの処理では使用しません。初期設定後は、通常の `main` へのpushだけで個人サイトまで自動更新されます。

公開先が更新されない場合は、このリポジトリの **Publish to personal site** と、個人サイトの **Deploy to GitHub Pages** の実行結果を確認してください。
