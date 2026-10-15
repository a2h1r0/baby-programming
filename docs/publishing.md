# 個人サイトへの自動公開

公開先：**https://atsuhi.ro/apps/baby-programming/**

## 自動反映の流れ

1. このリポジトリの `main` に変更がマージされると、GitHub Actionsの **Publish to personal site** が起動します。
2. オフラインゲームと公開HTMLの自動テストが成功した場合だけ、公開ジョブへ進みます。
3. `scripts/build-publication.cjs` がゲーム本体を読み、正式URL・タイトル・説明文・OGメタデータを付けたHTMLを生成します。
4. 登録済みSSH Deploy Keyで `a2h1r0/personal-page` の `master` に接続し、`apps/baby-programming/index.html` だけをコミット・pushします。
5. 個人サイトの既存GitHub Pagesが更新を公開します。

実行・コピー・コミット・公開はすべてGitHub上で行います。開発PCの電源や、鍵を最初に生成したPCのローカルファイルには依存しません。

## 公開ファイルの管理

- ゲームの編集元は、このリポジトリの `index.html` です。
- 配布用 `index.html` は従来どおり単独で利用できます。公開メタデータは生成時に追加し、ゲームの本文・スクリプト・見た目は変更しません。
- 個人サイト側の生成済みHTMLは、次の同期で更新されるため直接編集しません。
- 生成結果が同じ場合は、不要なコミットを作りません。
- 古い実行の再実行で巻き戻らないよう、push前に現在の `main` を確認します。公開ジョブは直列に実行します。
- `CNAME`、他のページ、他のアプリは同期対象に含めません。

個人サイトの紹介リンク・サイトマップは `personal-page` 側で管理します。

## 初期設定

設定済みの項目：

- `personal-page`：書き込み許可付きDeploy Key `baby-programming-sync`。
- `baby-programming`：ActionsのRepository secret `PERSONAL_PAGE_DEPLOY_KEY`。対応する秘密鍵を格納。
- 個人サイトのPages：`master` のルート、独自ドメイン `atsuhi.ro`。

Deploy Keyには有効期限がないため、期限更新のための定期作業はありません。鍵の削除・失効、権限やブランチ保護の変更、サービス障害などは実行失敗として表示されます。秘密鍵の値をコード・ログ・Issueへ貼り付けないでください。

## 手動で再実行する

GitHubの **Actions → Publish to personal site → Run workflow** で、ブランチ `main` を選びます。手動実行も `main` だけが公開対象です。PRのテストでは秘密鍵を使用せず、公開もしません。

## 更新できない場合

1. このリポジトリのActionsで **test** と **publish** の結果を確認します。
2. 認証エラーの場合は、公開鍵の書き込み許可と、対応する秘密鍵のSecrets登録を確認します。
3. 対象ブランチが更新されて競合した場合は、通常のfetch/rebaseで最大3回試します。競合や保護ルールを強制的に回避しません。
4. 個人サイトに同期コミットがあるのに表示が変わらない場合は、`personal-page` の **pages build and deployment** を確認します。Pagesの公開には時間がかかる場合があります。

## 開発時の確認

```text
node --test
node scripts/build-publication.cjs <確認用の出力フォルダー>
```

出力フォルダー内の `index.html` が公開版です。ソースの `index.html` を上書きする指定は受け付けません。
