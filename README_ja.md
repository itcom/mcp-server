# MCP ファイル操作サーバー

Claude Desktop と Web版Claude で使用できる、強力なModel Context Protocol (MCP) サーバーです。Express.jsをベースに構築され、AIアシスタント向けのシームレスなファイル操作機能を提供します。

## 🚀 主な機能

- **汎用互換性**: Claude Desktop と Web版Claude の両方で動作
- **GitHub仕様準拠**: 公式GitHub MCPサーバーのタイミングとプロトコル標準に準拠
- **Web版Claude最適化**: Web版Claudeの9秒タイムアウト制限に特別対応
- **OAuth統合**: Web版Claude接続用の完全なOAuth 2.0フロー
- **ファイル操作**: セキュリティ制御付きの包括的ファイルシステムアクセス
- **Laravelプロジェクト対応**: Laravelプロジェクト構造の自動分析機能
- **リアルタイム更新**: SSE (Server-Sent Events) によるリアルタイム通信
- **設定可能エンドポイント**: 環境変数によるエンドポイント設定
- **セッション管理**: 高度なセッション追跡と自動クリーンアップ

## 📋 必要な環境

- **Node.js**: v18.0.0 以上
- **npm**: 最新版
- **TypeScript**: v5.5.0 以上

## 🛠️ インストール

### クイックセットアップ

```bash
# リポジトリをクローン
git clone <your-repo-url>
cd mcp-file-operations-server

# 依存関係をインストール
npm install

# 環境設定ファイルを作成
cp .env.example .env

# プロジェクトをビルド
npm run build

# サーバーを起動
npm start
```

### 開発環境セットアップ

```bash
# 依存関係をインストール
npm install

# 自動リロード付きで開発モードで起動
npm run dev
```

## ⚙️ 設定

ルートディレクトリに `.env` ファイルを作成：

```env
# サーバー設定
BASE_URL=http://localhost:3001
ENDPOINT_PATH=/mcp-test
PORT=3001

# ファイルシステム
SERVER_ROOT=/path/to/your/project

# セキュリティ (オプション)
ALLOWED_EXTENSIONS=.php,.js,.ts,.json,.md,.txt,.yaml,.yml
```

### 環境変数

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `BASE_URL` | サーバーのベースURL | `http://localhost:3001` |
| `ENDPOINT_PATH` | MCPエンドポイントパス | `/mcp-test` |
| `PORT` | サーバーポート | `3001` |
| `SERVER_ROOT` | ファイル操作のルートディレクトリ | `process.cwd()` |

## 🎯 使用方法

### Claude Desktop での使用

Claude Desktop の設定ファイル (`~/Library/Application Support/Claude/claude_desktop_config.json` macOSの場合) に追加：

```json
{
  "mcpServers": {
    "file-operations": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "SERVER_ROOT": "/path/to/your/project",
        "PORT": "3001"
      }
    }
  }
}
```

### Web版Claude での使用

1. サーバーをローカルで起動するか、サーバーにデプロイ
2. Web版Claudeで **Integrations** → **Add Integration** を選択
3. サーバーURLを入力: `http://localhost:3001/mcp-test` (またはデプロイしたURL)
4. OAuthフローを完了
5. ファイル操作ツールの使用開始！

## 🔧 利用可能なツール

### `list_files`
フィルタリングオプション付きでファイルとディレクトリを一覧表示。

```json
{
  "directory": ".",
  "recursive": false,
  "include_hidden": false,
  "exclude_dirs": ["vendor", "node_modules", "storage", ".git"]
}
```

### `read_file`
エンコーディング対応でファイル内容を読み取り。

```json
{
  "file_path": "path/to/file.txt",
  "encoding": "utf8"
}
```

### `get_laravel_structure`
Laravelプロジェクトの構造を分析し、統計情報を取得。

```json
{
  "project_root": ".",
  "include_config": true
}
```

### `search_files`
パターンマッチングと内容検索でファイルを検索。

```json
{
  "directory": ".",
  "pattern": "Controller",
  "content_search": "function",
  "file_extension": ".php"
}
```

### `get_server_info`
サーバーステータスと設定情報を取得。

```json
{}
```

## 🏗️ アーキテクチャ

### コアコンポーネント

- **Express.js サーバー**: CORS とミドルウェア対応のメインHTTPサーバー
- **SSE ハンドラー**: リアルタイム通信用のServer-Sent Events
- **OAuth プロバイダー**: Web版Claude用の完全なOAuth 2.0実装
- **セッション管理**: 高度なセッション追跡とクリーンアップ
- **プロトコル管理**: 動的MCPプロトコルバージョン処理
- **ファイルシステムセキュリティ**: パスサニタイゼーションとファイル形式検証

### GitHub仕様準拠

このサーバーはGitHubの公式MCPサーバー仕様に準拠しています：

- ✅ **500ms初期化タイミング**: GitHubの公式初期化遅延に一致
- ✅ **デュアルハートビート戦略**: 30秒GitHub準拠 + 8秒Web版Claude最適化
- ✅ **プロトコルバージョン 2024-11-05**: GitHubの標準プロトコルバージョンに固定
- ✅ **適切なSSEヘッダー**: GitHub準拠のServer-Sent Events設定

## 🚀 デプロイ

### ローカル開発

```bash
npm run dev
```

### 本番環境

```bash
# プロジェクトをビルド
npm run build

# PM2で起動（推奨）
pm2 start dist/index.js --name mcp-server

# または直接起動
npm start
```

### Docker (オプション)

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY .env ./

EXPOSE 3001
CMD ["npm", "start"]
```

## 🔒 セキュリティ機能

- **パスサニタイゼーション**: ディレクトリトラバーサル攻撃を防止
- **ファイル形式制限**: 設定可能な許可ファイル拡張子
- **CORS保護**: 適切なクロスオリジンリソース共有設定
- **セッション管理**: 非アクティブセッションの自動クリーンアップ
- **OAuthセキュリティ**: Web版Claude用の安全なトークンベース認証

## 🐛 トラブルシューティング

### よくある問題

**ポートが既に使用中**
```bash
# ポート3001を使用しているプロセスを見つけて終了
lsof -ti:3001 | xargs kill -9
```

**ファイルアクセス拒否**
- `.env` の `SERVER_ROOT` パスを確認
- ファイルの権限を確認
- パスが存在し、読み取り可能であることを確認

**Web版Claude接続タイムアウト**
- OAuthエンドポイントがアクセス可能か確認
- ファイアウォール設定を確認
- デプロイ済みの場合、SSL/HTTPS設定を確認

**Claude Desktop がサーバーを検出しない**
- `claude_desktop_config.json` のパスを確認
- ビルドされた `dist/index.js` ファイルが存在することを確認
- 設定変更後にClaude Desktop を再起動

## 📚 API リファレンス

### ヘルスチェック
```http
GET /health
```

サーバーステータスとアクティブセッションを返します。

### OAuth エンドポイント
```http
GET /.well-known/oauth-authorization-server
GET /authorize
POST /token
GET /.well-known/jwks.json
```

### MCP エンドポイント
```http
GET /mcp-test    # リアルタイム通信用SSE接続
POST /mcp-test   # JSON-RPCツール実行
```

## 🤝 コントリビューション

1. リポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📝 ライセンス

このプロジェクトはMITライセンスの下でライセンスされています - 詳細は [LICENSE](LICENSE) ファイルを参照してください。

## 🙏 謝辞

- [Anthropic](https://anthropic.com) - Model Context Protocol仕様の提供
- [GitHub MCP Server](https://github.com/github/github-mcp-server) - 仕様準拠の参考実装
- MCPコミュニティ - プロトコル開発とベストプラクティスの共有

## 📞 サポート

問題が発生した場合や質問がある場合：

1. [トラブルシューティング](#-トラブルシューティング) セクションを確認
2. 既存の [Issues](../../issues) を検索
3. 詳細情報とともに新しいissueを作成

---

**MCPコミュニティのために ❤️ で作成**