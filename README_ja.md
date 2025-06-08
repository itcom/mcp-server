# MCP ファイル操作サーバー

Claude Desktop と Web版Claude で使用できる、強力なModel Context Protocol (MCP) サーバーです。Express.jsをベースに構築され、AIアシスタント向けのシームレスなファイル操作機能を提供します。

## 🚀 主な機能

- **自動動作モード判定**: 環境に応じてstdio/HTTPモードを自動選択
- **複数プロジェクト対応**: PROJECT_IDによるツール名前空間の分離
- **ファイル操作**: セキュリティ制御付きの包括的ファイルシステムアクセス
- **Laravelプロジェクト対応**: Laravelプロジェクト構造の自動分析機能
- **リアルタイム更新**: SSE (Server-Sent Events) によるリアルタイム通信
- **OAuth統合**: Web版Claude接続用の完全なOAuth 2.0フロー

## 📋 必要な環境

- **Node.js**: v18.0.0 以上（v22.15.0でテスト済み）
- **npm**: 最新版
- **TypeScript**: v5.5.0 以上

## ⚙️ 設定方法

このサーバーは **2つの方法** で設定できます：

### 1. 環境変数での設定

```bash
# 直接環境変数を指定
SERVER_ROOT=/path/to/project PROJECT_ID=myproject PORT=3001 node dist/index.js

# systemdサービスでの設定例
Environment=SERVER_ROOT=/var/www/project
Environment=PROJECT_ID=production
Environment=PORT=3001
```

### 2. .envファイルでの設定

プロジェクトルートに `.env` ファイルを作成：

```bash
# MCP Server Configuration

# 動作モード (auto, stdio, http)
MCP_MODE=auto

# プロジェクト設定
PROJECT_ID=myproject
SERVER_ROOT=/var/www/project

# HTTPモード設定
PORT=3001
BASE_URL=https://mcp.your-domain.com
ENDPOINT_PATH=/sse

# セキュリティ設定
ALLOWED_EXTENSIONS=.php,.js,.ts,.json,.md,.txt,.yaml,.yml,.blade.php,.service,.conf,.sh,.xml

# Node.js環境
NODE_ENV=production
```

### 設定の優先順位

1. **環境変数** （最優先）
2. **Claude Desktop設定の env** 
3. **.envファイル**
4. **デフォルト値**

### Claude Desktop での設定例

```json
{
  "mcpServers": {
    "my-project": {
      "command": "/path/to/node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "SERVER_ROOT": "/path/to/project",
        "MCP_MODE": "stdio",
        "PROJECT_ID": "myproject"
      }
    }
  }
}
```

この場合、Claude Desktopの`env`設定が最優先され、`.env`ファイルの設定より優先されます。

### リモートサーバーでの設定例

**systemdサービス**（環境変数）:
```ini
Environment=NODE_ENV=production
Environment=SERVER_ROOT=/var/www/project
Environment=PORT=3001
Environment=PROJECT_ID=production
```

**または .envファイル**:
```bash
NODE_ENV=production
SERVER_ROOT=/var/www/project
PORT=3001
PROJECT_ID=production
```

## 🏗️ 動作モード

### 自動モード判定ロジック

```typescript
const MODE = process.env.MCP_MODE || 'auto';
const isHttpArgs = process.argv.includes('--http');
const hasPortEnv = process.env.PORT;
const isStdioMode = MODE === 'stdio' || (MODE === 'auto' && !hasPortEnv && !isHttpArgs);
```

| 条件 | 動作モード | 用途 |
|------|-----------|------|
| `MCP_MODE=stdio` | **stdio** | Desktop Claude（ローカル開発） |
| `MCP_MODE=http` | **HTTP** | リモートサーバー（本番環境） |
| `MCP_MODE=auto` + `PORT`なし | **stdio** | Desktop Claude（自動判定） |
| `MCP_MODE=auto` + `PORT`あり | **HTTP** | リモートサーバー（自動判定） |
| `--http`フラグ | **HTTP** | コマンドライン指定 |

### stdioモード（ローカル開発推奨）

**特徴**:
- 最高のパフォーマンス
- ネットワークオーバーヘッドなし
- Desktop Claude専用
- 直接プロセス通信
- Claude Desktopが自動的にプロセスを起動・管理

**テスト方法**（動作確認用）:
```bash
# ビルド確認
npm run build

# 動作テスト（すぐにCtrl+Cで終了）
node dist/index.js
# 出力確認: "Desktop Claude MCP Server started"
```

### HTTPモード（リモートサーバー）

**特徴**:
- Web版Claude対応
- リモートアクセス可能
- OAuth認証対応
- Nginx経由でのSSL対応

**起動方法**:
```bash
# 環境変数指定
PORT=3001 node dist/index.js

# 明示的指定
MCP_MODE=http PORT=3001 node dist/index.js
```

## 🛠️ インストール

### ローカル開発（stdioモード）

```bash
# リポジトリをクローン
git clone <your-repo-url>
cd mcp-server

# 依存関係をインストール
npm install

# プロジェクトをビルド
npm run build

# stdioモードでテスト
node dist/index.js
# 出力: "Desktop Claude MCP Server started"
```

### リモートサーバー（HTTPモード）

```bash
# 依存関係をインストール
npm install

# プロジェクトをビルド
npm run build

# HTTPモードで起動
PORT=3001 npm start
# 出力: "HTTPサーバー起動完了 (Port: 3001)"
```

## 🎯 使用方法

### Claude Desktop での使用（stdioモード）

Claude Desktop の設定ファイルに追加：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "local-project-files": {
      "command": "/Users/[ユーザー名]/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/bin/node",
      "args": [
        "/path/to/mcp-server/dist/index.js"
      ],
      "env": {
        "SERVER_ROOT": "/path/to/your/project",
        "MCP_MODE": "stdio",
        "PROJECT_ID": "myproject"
      }
    },
    "mcp-server-files": {
      "command": "/Users/[ユーザー名]/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/bin/node",
      "args": [
        "/path/to/mcp-server/dist/index.js"
      ],
      "env": {
        "SERVER_ROOT": "/path/to/mcp-server",
        "MCP_MODE": "stdio",
        "PROJECT_ID": "mcp"
      }
    }
  }
}
```

### Claude Desktop での使用（リモートHTTPモード）

```json
{
  "mcpServers": {
    "remote-server-files": {
      "command": "/Users/[ユーザー名]/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/bin/npx",
      "args": [
        "mcp-remote",
        "https://your-server.com/sse"
      ],
      "env": {
        "PATH": "/Users/[ユーザー名]/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/bin:/usr/local/bin:/usr/bin:/bin",
        "NODE_PATH": "/Users/[ユーザー名]/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/lib/node_modules"
      }
    }
  }
}
```

### 複数プロジェクト管理における重要な注意事項

**PROJECT_IDは必須**:
- 各プロジェクトには異なる`PROJECT_ID`を設定
- ツール名の重複を防ぐため（例: `projecta_list_files`, `projectb_list_files`）
- 未設定の場合、ディレクトリ名から自動生成

### Node.jsパスの確認方法

```bash
# Node.jsのインストールパスを確認
which node

# nvm（Node Version Manager）を使用している場合
nvm which current

# 例の出力:
# /Users/username/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/bin/node
# /usr/local/bin/node
# /opt/homebrew/bin/node
```

## 🚀 本番環境でのリモートサーバー設定

### systemdサービス設定

`/etc/systemd/system/mcp-server.service`:

```ini
[Unit]
Description=MCP File Operations Server
Documentation=https://github.com/itcomllc/mcp-server
After=network.target
Wants=network.target

[Service]
Type=simple
User=web
Group=web
WorkingDirectory=/var/www/project/mcp-server
Environment=NODE_ENV=production
Environment=SERVER_ROOT=/var/www/project
Environment=PORT=3001
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mcp-server

# セキュリティ設定
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=/var/www/project/mcp-server
ReadOnlyPaths=/var/www/project

# リソース制限
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

### Nginx設定

`/etc/nginx/sites-available/mcp-server`:

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name mcp.your-domain.com;

    root /var/www/project/mcp-server;

    # SSL設定
    ssl_certificate     /etc/letsencrypt/live/mcp.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.your-domain.com/privkey.pem;

    # SSL最適化設定
    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:!DSS:!3DES:!RC4:!aNULL:!eNULL:!MD5:!SHA1:!EXP:!PSK:!SRP';
    ssl_ecdh_curve prime256v1;
    ssl_prefer_server_ciphers on;

    # MCP SSEエンドポイント
    location /sse {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE専用設定
        proxy_cache off;
        proxy_buffering off;
        chunked_transfer_encoding off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # OAuth エンドポイント
    location ~ ^/(\.well-known/oauth-authorization-server|authorize|token|register) {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ヘルスチェックエンドポイント
    location /health {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 短いタイムアウト
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
        proxy_connect_timeout 5s;
    }

    # セキュリティヘッダー
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
}
```

### デプロイ手順

```bash
# 1. サーバーでコードを準備
git clone <your-repo-url> /var/www/project/mcp-server
cd /var/www/project/mcp-server
npm install
npm run build

# 2. systemdサービスを有効化
sudo systemctl enable mcp-server
sudo systemctl start mcp-server
sudo systemctl status mcp-server

# 3. Nginx設定を有効化
sudo ln -s /etc/nginx/sites-available/mcp-server /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 4. SSL証明書取得（Let's Encrypt）
sudo certbot --nginx -d mcp.your-domain.com

# 5. 動作確認
curl https://mcp.your-domain.com/health
```

## 🔧 利用可能なツール

すべてのツールには自動的に `PROJECT_ID` が前置されます：

### `[PROJECT_ID]_list_files`
フィルタリングオプション付きでファイルとディレクトリを一覧表示。

```json
{
  "directory": ".",
  "recursive": false,
  "include_hidden": false,
  "exclude_dirs": ["vendor", "node_modules", "storage", ".git"]
}
```

### `[PROJECT_ID]_read_file`
エンコーディング対応でファイル内容を読み取り。

```json
{
  "file_path": "path/to/file.txt",
  "encoding": "utf8"
}
```

### `[PROJECT_ID]_get_laravel_structure`
Laravelプロジェクトの構造を分析し、統計情報を取得。

```json
{
  "project_root": ".",
  "include_config": true
}
```

### `[PROJECT_ID]_search_files`
パターンマッチングと内容検索でファイルを検索。

```json
{
  "directory": ".",
  "pattern": "Controller",
  "content_search": "function",
  "file_extension": ".php"
}
```

### `[PROJECT_ID]_get_server_info`
サーバーステータスと設定情報を取得。

```json
{}
```

## ⚙️ 環境変数

| 変数名 | 説明 | デフォルト値 | stdio | HTTP |
|--------|------|-------------|-------|------|
| `MCP_MODE` | 動作モード: auto/stdio/http | `auto` | ✅ | ✅ |
| `PROJECT_ID` | ツール名前空間の識別子 | 自動生成 | ✅ | ✅ |
| `SERVER_ROOT` | ファイル操作のルートディレクトリ | `process.cwd()` | ✅ | ✅ |
| `PORT` | HTTPサーバーポート | なし | ❌ | ✅ |
| `BASE_URL` | HTTPモード用ベースURL | `http://localhost:3001` | ❌ | ✅ |
| `ENDPOINT_PATH` | MCPエンドポイントパス | `/sse` | ❌ | ✅ |

## 🐛 トラブルシューティング

### 動作モードの確認

```bash
# stdio モードの確認
node dist/index.js
# 出力: "Desktop Claude MCP Server started"

# HTTP モードの確認
PORT=3001 node dist/index.js
# 出力: "HTTPサーバー起動完了 (Port: 3001)"
```

### よくある問題

**Node.jsパスが分からない**:
```bash
which node
nvm which current
```

**PROJECT_IDの重複**:
- 各プロジェクトには異なるPROJECT_IDを設定
- 同一PROJECT_IDを使用するとツール名が重複

**systemdサービスが起動しない**:
```bash
sudo systemctl status mcp-server
sudo journalctl -u mcp-server -f
```

**Nginx設定エラー**:
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

## 📚 設定例テンプレート

### claude-desktop-config.json（完全版）

```json
{
  "mcpServers": {
    "local-project-a": {
      "command": "/path/to/node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "SERVER_ROOT": "/path/to/project-a",
        "MCP_MODE": "stdio",
        "PROJECT_ID": "projecta"
      }
    },
    "local-project-b": {
      "command": "/path/to/node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "SERVER_ROOT": "/path/to/project-b",
        "MCP_MODE": "stdio",
        "PROJECT_ID": "projectb"
      }
    },
    "remote-production": {
      "command": "/path/to/npx",
      "args": ["mcp-remote", "https://mcp.your-domain.com/sse"],
      "env": {
        "PATH": "/path/to/node/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

## 💡 ベストプラクティス

1. **ローカル開発はstdioモード** - 最高のパフォーマンス
2. **本番環境はHTTPモード** - Nginx + systemd + SSL
3. **PROJECT_IDで名前空間分離** - ツール名の重複を防ぐ
4. **環境変数でモード制御** - `MCP_MODE`での明示的指定
5. **セキュリティ設定** - systemdの制限とNginxのヘッダー設定

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
- [Cloudflare](https://developers.cloudflare.com/agents/) - MCP実装ガイダンス
- MCPコミュニティ - プロトコル開発とベストプラクティスの共有

---

**ローカル開発からリモート本番まで、シームレスなMCP体験を！**