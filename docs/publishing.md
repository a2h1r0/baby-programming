# 個人サイトへの自動公開

公開先：**https://atsuhi.ro/apps/baby-programming/bee-and-flower/**

## 自動反映の流れ

1. このリポジトリの `main` に変更がマージされると、GitHub Actionsの **Publish to personal site** が起動します。
2. オフラインゲームと公開HTMLの自動テストが成功した場合だけ、公開ジョブへ進みます。
3. 登録済みSSH Deploy Keyで `a2h1r0/personal-page` の `master` に接続し、`apps/baby-programming/bee-and-flower.json` の `revision` をテスト済みコミットのSHAに更新してpushします。
4. 個人サイトの **Deploy to GitHub Pages** が、そのSHAのゲームを一時ディレクトリに取得し、再度テストします。
5. サイトをビルド後、取得した `scripts/build-publication.cjs` が正式URL・タイトル・説明文・favicon・OGP・X向けカード設定を付けたHTMLと画像を `dist/apps/baby-programming/bee-and-flower/` に生成します。
6. ゲームを含む `dist/` をGitHub Pagesへ公開します。ゲームのHTML・画像は個人サイトのGit管理に追加しません。

通知・取得・生成・公開はすべてGitHub上で行います。開発PCの電源や、鍵を最初に生成したPCのローカルファイルには依存しません。

## 公開ファイルの管理

- ゲームの編集元は、このリポジトリの `index.html` です。
- 配布用 `index.html` は従来どおり単独で利用できます。公開メタデータは生成時に追加し、ゲームの本文・スクリプト・見た目は変更しません。
- faviconはルートの `favicon.ico`、OGP画像はルートの `image.png` を編集します。OGP画像のサイズを変える場合は、生成処理の `og:image:width`・`og:image:height` も更新してください。
- 個人サイトに保存するゲーム固有の情報は、公開する版を示すJSONだけです。ゲームの編集・画像の更新はこのリポジトリで行います。
- 個人サイトの更新時も、JSONに記録されたSHAから生成するため、ゲームの版は勝手に変わりません。
- 公開するSHAが同じ場合は、不要なコミットを作りません。
- 古い実行の再実行で巻き戻らないよう、push前に現在の `main` を確認します。公開ジョブは直列に実行します。
- 更新対象は `apps/baby-programming/bee-and-flower.json` だけです。

個人サイトの紹介リンク・サイトマップは `personal-page` 側で管理します。

## 初期設定

設定済みの項目：

- `personal-page`：書き込み許可付きDeploy Key `baby-programming-sync`。
- `baby-programming`：ActionsのRepository secret `PERSONAL_PAGE_DEPLOY_KEY`。対応する秘密鍵を格納。
- 個人サイトのPages：公開元は **GitHub Actions**、独自ドメイン `atsuhi.ro`。

移行時は、先に個人サイト側の公開時取り込み対応をマージします。その対応で公開版のJSONと取り込み処理を追加した後、このリポジトリの通知処理へ切り替えます。JSONがまだない場合、通知処理は変更をpushせずに停止します。

Deploy Keyには有効期限がないため、期限更新のための定期作業はありません。鍵の削除・失効、権限やブランチ保護の変更、サービス障害などは実行失敗として表示されます。秘密鍵の値をコード・ログ・Issueへ貼り付けないでください。

## 手動で再実行する

GitHubの **Actions → Publish to personal site → Run workflow** で、ブランチ `main` を選びます。手動実行も `main` だけが公開対象です。PRのテストでは秘密鍵を使用せず、公開もしません。

## 更新できない場合

1. このリポジトリのActionsで **test** と **publish** の結果を確認します。
2. 認証エラーの場合は、公開鍵の書き込み許可と、対応する秘密鍵のSecrets登録を確認します。
3. 対象ブランチが更新されて競合した場合は、通常のfetch/rebaseで最大3回試します。競合や保護ルールを強制的に回避しません。
4. 個人サイトに公開版の更新コミットがあるのに表示が変わらない場合は、`personal-page` の **Deploy to GitHub Pages** のビルド・公開結果を確認します。取り込み・テスト・生成に失敗した場合は、現在公開中のサイトを維持します。

## 開発時の確認

```text
node --test
node scripts/build-publication.cjs <確認用の出力フォルダー>
```

出力フォルダー内の `index.html`・`favicon.ico`・`image.png` が公開用ファイルです。ソースの `index.html` を上書きする指定は受け付けません。
